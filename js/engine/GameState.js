/**
 * GameState.js – Centralized State Authority (Phase 5)
 *
 * Single source of truth for all persistent, shared game data.
 * Enforces strict unidirectional data flow:
 *   Input → InteractionManager → EventBus → Systems → GameState → Renderers/UI
 *
 * Rules:
 *   - All systems MUST read from GameState
 *   - All persistent updates MUST go through GameState.applyAction()
 *   - Renderers/UI MUST NOT hold authoritative state
 *   - No direct state mutation outside GameState
 *   - No duplicate persistent state
 *
 * @module GameState
 */

/* ── Resolve EventBus dependency ───────────────────────────────────────────── */
const _resolvedEventBus = (() => {
  if (typeof EventBus !== 'undefined') return EventBus;
  if (typeof require === 'function') {
    try { return require('./eventBus.js'); } catch (e) { return null; }
  }
  return null;
})();

const GameState = (() => {
  'use strict';

  const _EventBus = _resolvedEventBus;

  // ── Dev mode: toggleable for testing ─────────────────────────────────────
  let _devMode = (typeof process !== 'undefined' && process.env &&
    process.env.NODE_ENV === 'development');

  // ── Configuration ────────────────────────────────────────────────────────
  const MAX_HISTORY       = 50;
  const MAX_CHAIN_DEPTH   = 10;
  const MAX_EVENT_PER_TYPE = 5;

  // ── Internal State (NEVER directly exposed) ──────────────────────────────
  const _state = {
    map: {
      width:  0,
      height: 0,
      tiles:  [],
    },

    tokens: {},
    // { [id]: { id, characterId, x, y, hp, maxHp, name, avatar,
    //           statusEffects, rotation, scale, tempHp, conditions,
    //           visionRadius, darkvision, auraRadius, auraColor,
    //           faction, animState, lightRadius, lerpPosition } }

    combat: {
      active:           false,
      round:            1,
      turnOrder:        [],
      currentTurnIndex: 0,
      actionBudgets:    {},
      conditions:       {},
    },

    selection: {
      selectedTokenId: null,
      hoveredTile:     null,
    },
  };

  // ── Action Queue (FIFO, deterministic) ───────────────────────────────────
  const _actionQueue = [];
  let _processing    = false;

  // ── Transaction System ───────────────────────────────────────────────────
  let _inTransaction   = false;
  const _pendingEvents = [];

  // ── Event Deduplication (per-tick) ───────────────────────────────────────
  const _emittedThisTick       = new Map();
  let   _tickCleanupScheduled  = false;

  // ── Event Chain Tracking ─────────────────────────────────────────────────
  let _eventChainDepth      = 0;
  let _eventCountsThisChain = {};

  // ── History ──────────────────────────────────────────────────────────────
  const _history     = [];
  let   _historyIndex = -1;
  let   _isUndoRedo   = false; // Prevent history recording during undo/redo

  // ── Tile Definitions (mirroring MapEngine for validation) ────────────────
  const TILE_DEFS = {
    floor: true, stone: true, wall: true, water: true, door: true,
    trap: true, grass: true, lava: true, stairs: true, chest: true,
  };

  // ════════════════════════════════════════════════════════════════════════
  //  READ SAFETY — Shallow copies + dev-mode freeze
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Protect an object from mutation. In dev mode, Object.freeze is applied.
   * @param {object} obj
   * @returns {object}
   */
  function _protect(obj) {
    if (!_devMode || !obj || typeof obj !== 'object') return obj;
    return _deepFreeze(obj);
  }

  /** Recursively freeze an object and all nested objects/arrays. */
  function _deepFreeze(obj) {
    if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    Object.freeze(obj);
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const v = obj[keys[i]];
      if (v && typeof v === 'object') _deepFreeze(v);
    }
    return obj;
  }

  /**
   * Create a safe copy of a token object (shallow + array copies).
   * @param {object} token - Internal token reference
   * @returns {object} Safe copy
   */
  function _copyToken(token) {
    if (!token) return null;
    const copy = {
      ...token,
      statusEffects: [...(token.statusEffects || [])],
      conditions:    [...(token.conditions    || [])],
    };
    return _protect(copy);
  }

  /**
   * Create a safe copy of a tile object.
   * @param {object} tile
   * @returns {object|null}
   */
  function _copyTile(tile) {
    if (!tile) return null;
    return _protect({ ...tile });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PUBLIC GETTERS — Read-only access to state
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Get a full snapshot of the current state. Costly — use sparingly.
   * @returns {object}
   */
  function getState() {
    const tokensCopy = {};
    for (const id of Object.keys(_state.tokens)) {
      tokensCopy[id] = _copyToken(_state.tokens[id]);
    }
    const copy = {
      map: {
        width:  _state.map.width,
        height: _state.map.height,
        tiles:  _state.map.tiles.map(row => row.map(t => _copyTile(t))),
      },
      tokens: tokensCopy,
      combat: {
        active:           _state.combat.active,
        round:            _state.combat.round,
        turnOrder:        _state.combat.turnOrder.map(p => ({ ...p })),
        currentTurnIndex: _state.combat.currentTurnIndex,
        actionBudgets:    _copyBudgets(),
        conditions:       _copyConditions(),
      },
      selection: { ..._state.selection },
    };
    return _protect(copy);
  }

  /** Get a single token by ID (safe copy). */
  function getToken(id) {
    return _copyToken(_state.tokens[id]);
  }

  /** Get all tokens as an object map of safe copies. */
  function getAllTokens() {
    const result = {};
    for (const id of Object.keys(_state.tokens)) {
      result[id] = _copyToken(_state.tokens[id]);
    }
    return result;
  }

  /** Get all tokens as an array of safe copies. */
  function getTokensArray() {
    return Object.values(_state.tokens).map(t => _copyToken(t));
  }

  /** Get a map tile at (row, col). Returns safe copy or null. */
  function getMapTile(row, col) {
    if (row < 0 || row >= _state.map.height ||
        col < 0 || col >= _state.map.width) return null;
    return _copyTile(_state.map.tiles[row][col]);
  }

  /** Get map dimensions. */
  function getMapDimensions() {
    return _protect({ width: _state.map.width, height: _state.map.height });
  }

  /** Get combat state (safe copy). */
  function getCombat() {
    return _protect({
      active:           _state.combat.active,
      round:            _state.combat.round,
      turnOrder:        _state.combat.turnOrder.map(p => ({ ...p })),
      currentTurnIndex: _state.combat.currentTurnIndex,
      actionBudgets:    _copyBudgets(),
      conditions:       _copyConditions(),
    });
  }

  /** Get selection state (safe copy). */
  function getSelection() {
    return _protect({ ..._state.selection });
  }

  function _copyBudgets() {
    const result = {};
    for (const id of Object.keys(_state.combat.actionBudgets)) {
      result[id] = { ..._state.combat.actionBudgets[id] };
    }
    return result;
  }

  function _copyConditions() {
    const result = {};
    for (const id of Object.keys(_state.combat.conditions)) {
      result[id] = [..._state.combat.conditions[id]];
    }
    return result;
  }

  /** Get combat budgets for a token (safe copy). */
  function getCombatBudget(tokenId) {
    const b = _state.combat.actionBudgets[tokenId];
    return b ? { ...b } : null;
  }

  /** Get conditions for a token (safe copy). */
  function getCombatConditions(tokenId) {
    const c = _state.combat.conditions[tokenId];
    return c ? [...c] : [];
  }

  /**
   * Get raw tiles reference for bulk read operations (e.g., floodFill).
   * MUST NOT be mutated — use applyAction('map.setTile') for writes.
   *
   * NOTE: UNUSED at runtime. All tile reads go through MapEngine.mapState.
   */
  function getMapTilesRaw() {
    return _state.map.tiles;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  INTERNAL HELPERS
  // ════════════════════════════════════════════════════════════════════════

  function _clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function _createTile(type) {
    const WALKABILITY = {
      floor: true, stone: true, wall: false, water: false, door: true,
      trap: true, grass: true, lava: false, stairs: true, chest: true,
    };
    return {
      type:     type || null,
      walkable: (type && WALKABILITY[type] !== undefined) ? WALKABILITY[type] : true,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PRIVATE MUTATION METHODS — Called ONLY by _executeAction
  // ════════════════════════════════════════════════════════════════════════

  // ── Map Mutations ────────────────────────────────────────────────────────
  // NOTE: These map actions (map.init, map.setTile, map.resize, map.restore)
  // are UNUSED in runtime. MapEngine is the sole source of truth for tile
  // data — all rendering, fog, and UI read from MapEngine.mapState.
  // These handlers are retained only for test coverage and potential future
  // unification. Do NOT call them from new code; use MapEngine instead.

  function _initMap(payload) {
    const w = _clamp(payload.width  || 20, 5, 50);
    const h = _clamp(payload.height || 15, 5, 30);

    _state.map.width  = w;
    _state.map.height = h;
    _state.map.tiles  = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => _createTile(null))
    );

    _emitChange('state.map.updated', { type: 'init', width: w, height: h });
  }

  function _setTile(payload) {
    const { row, col, type } = payload;
    if (typeof row !== 'number' || typeof col !== 'number') return;
    if (row < 0 || row >= _state.map.height ||
        col < 0 || col >= _state.map.width) return;

    const actualType = (!type || type === 'empty') ? null : type;
    const current    = _state.map.tiles[row][col];

    // No-op check
    if (current && current.type === actualType) return;

    const prev = current ? { ...current } : null;
    _state.map.tiles[row][col] = _createTile(actualType);

    _emitChange('state.map.updated', { type: 'setTile', row, col, tileType: actualType });
    return { prev };
  }

  function _resizeMap(payload) {
    const w = _clamp(payload.width, 5, 50);
    const h = _clamp(payload.height, 5, 30);
    const oldTiles = _state.map.tiles;
    _state.map.width = w;
    _state.map.height = h;
    _state.map.tiles = Array.from({ length: h }, (_, r) =>
      Array.from({ length: w }, (_, c) =>
        (oldTiles[r] && oldTiles[r][c]) ? { ...oldTiles[r][c] } : _createTile(null)
      )
    );
    _emitChange('state.map.updated', { type: 'resize', width: w, height: h });
  }

  function _restoreMap(payload) {
    _state.map.width = payload.width;
    _state.map.height = payload.height;
    _state.map.tiles = payload.tiles.map(row => row.map(t => ({ ...t })));
    _emitChange('state.map.updated', { type: 'restore' });
  }

  // ── Token Mutations ──────────────────────────────────────────────────────

  function _addToken(payload) {
    if (!payload || payload.id === undefined) return;
    const id = payload.id;

    _state.tokens[id] = {
      id:            id,
      characterId:   payload.characterId !== undefined ? payload.characterId : null,
      x:             payload.x !== undefined ? payload.x : 0,
      y:             payload.y !== undefined ? payload.y : 0,
      hp:            payload.hp !== undefined ? payload.hp : 10,
      maxHp:         payload.maxHp !== undefined ? payload.maxHp : 10,
      name:          payload.name || 'Token',
      avatar:        payload.avatar || '⬤',
      statusEffects: payload.statusEffects ? [...payload.statusEffects] : [],
      rotation:      payload.rotation !== undefined ? payload.rotation : 0,
      scale:         payload.scale !== undefined ? payload.scale : 1,
      tempHp:        payload.tempHp !== undefined ? payload.tempHp : 0,
      conditions:    payload.conditions ? [...payload.conditions] : [],
      visionRadius:  payload.visionRadius !== undefined ? payload.visionRadius : 6,
      darkvision:    payload.darkvision !== undefined ? payload.darkvision : 0,
      auraRadius:    payload.auraRadius !== undefined ? payload.auraRadius : 0,
      auraColor:     payload.auraColor || '#c8a84b',
      faction:       payload.faction || 'ally',
      animState:     payload.animState || 'idle',
      lightRadius:   payload.lightRadius !== undefined ? payload.lightRadius : 0,
      lerpPosition:  payload.lerpPosition || null,
    };

    _emitChange('state.token.updated', { id, changes: { added: true } });
  }

  function _removeToken(payload) {
    const id = payload.id !== undefined ? payload.id : payload;
    if (!_state.tokens[id]) return;

    const removed = { ..._state.tokens[id],
      statusEffects: [...(_state.tokens[id].statusEffects || [])],
      conditions:    [...(_state.tokens[id].conditions    || [])],
    };
    delete _state.tokens[id];

    // Clear selection if removed token was selected
    if (_state.selection.selectedTokenId === id) {
      _state.selection.selectedTokenId = null;
      _emitChange('state.selection.changed', { selectedTokenId: null });
    }

    _emitChange('state.token.updated', { id, changes: { removed: true } });
    return { removed };
  }

  function _setTokenPosition(payload) {
    const { id, x, y } = payload;
    const token = _state.tokens[id];
    if (!token) return;
    if (typeof x !== 'number' || typeof y !== 'number') return;

    const prevX = token.x;
    const prevY = token.y;

    // No-op check
    if (prevX === x && prevY === y) return;

    token.x = x;
    token.y = y;

    _emitChange('state.token.updated', { id, changes: { x, y } });
    return { prevX, prevY };
  }

  function _setTokenHP(payload) {
    const { id, hp } = payload;
    const token = _state.tokens[id];
    if (!token) return;
    if (typeof hp !== 'number') return;

    const clampedHp = Math.max(0, Math.min(token.maxHp, hp));
    const prevHp    = token.hp;

    // No-op check
    if (prevHp === clampedHp) return;

    token.hp = clampedHp;

    _emitChange('state.token.updated', { id, changes: { hp: clampedHp } });
    return { prevHp };
  }

  function _updateToken(payload) {
    const { id } = payload;
    const token = _state.tokens[id];
    if (!token) return;

    const changes = {};
    const prev    = {};
    let changed   = false;

    for (const key of Object.keys(payload)) {
      if (key === 'id') continue;
      if (key === 'statusEffects') {
        const newArr = [...payload.statusEffects];
        const oldArr = token.statusEffects;
        if (JSON.stringify(newArr) !== JSON.stringify(oldArr)) {
          prev.statusEffects = [...oldArr];
          token.statusEffects = newArr;
          changes.statusEffects = newArr;
          changed = true;
        }
      } else if (key === 'conditions') {
        const newArr = [...payload.conditions];
        const oldArr = token.conditions;
        if (JSON.stringify(newArr) !== JSON.stringify(oldArr)) {
          prev.conditions = [...oldArr];
          token.conditions = newArr;
          changes.conditions = newArr;
          changed = true;
        }
      } else if (token[key] !== payload[key]) {
        prev[key]    = token[key];
        token[key]   = payload[key];
        changes[key] = payload[key];
        changed      = true;
      }
    }

    if (changed) {
      _emitChange('state.token.updated', { id, changes });
      return { prev };
    }
  }

  function _removeTokenByCharId(payload) {
    const charId = payload.characterId;
    for (const id of Object.keys(_state.tokens)) {
      if (_state.tokens[id].characterId === charId) {
        return _removeToken({ id: Number(id) || id });
      }
    }
  }

  function _bulkSetTokens(payload) {
    // Replace all tokens at once (used by deserialize)
    _state.tokens = {};
    if (payload.tokens) {
      for (const t of payload.tokens) {
        _state.tokens[t.id] = {
          ...t,
          statusEffects: [...(t.statusEffects || [])],
          conditions:    [...(t.conditions    || [])],
        };
      }
    }
    _emitChange('state.token.updated', { changes: { bulk: true } });
  }

  // ── Selection Mutations ──────────────────────────────────────────────────

  function _setSelection(payload) {
    const tokenId = payload.tokenId !== undefined ? payload.tokenId : null;

    // No-op check
    if (_state.selection.selectedTokenId === tokenId) return;

    const prev = _state.selection.selectedTokenId;
    _state.selection.selectedTokenId = tokenId;

    _emitChange('state.selection.changed', { selectedTokenId: tokenId });
    return { prev };
  }

  function _setHoveredTile(payload) {
    const { row, col } = payload;
    const key = (row !== undefined && col !== undefined) ? `${row},${col}` : null;
    const prev = _state.selection.hoveredTile;
    const prevKey = prev ? `${prev.row},${prev.col}` : null;

    // No-op check
    if (key === prevKey) return;

    _state.selection.hoveredTile = key ? { row, col } : null;
    _emitChange('state.selection.changed', { hoveredTile: _state.selection.hoveredTile });
    return { prev };
  }

  // ── Combat Mutations ─────────────────────────────────────────────────────

  function _setCombatState(payload) {
    const prev = {
      active:           _state.combat.active,
      round:            _state.combat.round,
      turnOrder:        _state.combat.turnOrder.map(p => ({ ...p })),
      currentTurnIndex: _state.combat.currentTurnIndex,
    };

    if (payload.active !== undefined) _state.combat.active = payload.active;
    if (payload.round  !== undefined) _state.combat.round  = payload.round;
    if (payload.turnOrder !== undefined) {
      _state.combat.turnOrder = payload.turnOrder.map(p => ({ ...p }));
    }
    if (payload.currentTurnIndex !== undefined) {
      _state.combat.currentTurnIndex = payload.currentTurnIndex;
    }

    _emitChange('state.combat.updated', { changes: payload });
    return { prev };
  }

  function _setCombatBudget(payload) {
    const { tokenId, budget } = payload;
    if (!tokenId || !budget) return;

    const prev = _state.combat.actionBudgets[tokenId]
      ? { ..._state.combat.actionBudgets[tokenId] }
      : null;

    _state.combat.actionBudgets[tokenId] = { ...budget };
    return { prev };
  }

  function _useCombatAction(payload) {
    const { tokenId, cost, amount } = payload;
    const budget = _state.combat.actionBudgets[tokenId];
    if (!budget || !(cost in budget)) return { success: false };

    const amt = amount !== undefined ? amount : 1;
    if (budget[cost] < amt) return { success: false };

    const prev = budget[cost];
    budget[cost] -= amt;
    return { success: true, prev };
  }

  function _addCondition(payload) {
    const { tokenId, condition } = payload;
    if (!_state.combat.conditions[tokenId]) {
      _state.combat.conditions[tokenId] = [];
    }
    const arr = _state.combat.conditions[tokenId];
    if (!arr.includes(condition)) {
      arr.push(condition);
    }
  }

  function _removeCondition(payload) {
    const { tokenId, condition } = payload;
    const arr = _state.combat.conditions[tokenId];
    if (!arr) return;
    const idx = arr.indexOf(condition);
    if (idx !== -1) arr.splice(idx, 1);
  }

  function _clearCombatBudgets() {
    for (const key of Object.keys(_state.combat.actionBudgets)) {
      delete _state.combat.actionBudgets[key];
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ACTION DISPATCHER — Single entry point for all mutations
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Queue an action for processing. This is the ONLY public mutation pathway.
   * @param {{ type: string, payload: object }} action
   */
  function applyAction(action) {
    if (!action || !action.type) {
      if (_devMode) console.warn('GameState: Invalid action (missing type)');
      return;
    }
    _actionQueue.push(action);
    if (!_processing) _processQueue();
  }

  /** Process all queued actions sequentially (FIFO). */
  function _processQueue() {
    _processing = true;
    while (_actionQueue.length > 0) {
      const action = _actionQueue.shift();
      _executeAction(action);
    }
    _processing = false;
  }

  /**
   * Execute a single action, routing to the appropriate mutation method.
   * This is a thin router — NO business logic here.
   */
  function _executeAction(action) {
    const { type, payload } = action;
    let inverseData = null;

    switch (type) {
      // ── Map (UNUSED at runtime — MapEngine is the sole tile authority) ──
      case 'map.init':
        if (_devMode) console.warn('GameState: map.init is deprecated — use MapEngine.initMap() instead');
        _initMap(payload);
        // No meaningful inverse for init
        break;

      case 'map.setTile':
        if (_devMode) console.warn('GameState: map.setTile is deprecated — use MapEngine.setTile() instead');
        inverseData = _setTile(payload);
        if (inverseData) {
          _pushHistory(type, payload, {
            type: 'map.setTile',
            payload: { row: payload.row, col: payload.col,
                       type: inverseData.prev ? inverseData.prev.type : null },
          });
        }
        break;

      case 'map.resize':
        if (_devMode) console.warn('GameState: map.resize is deprecated — use MapEngine.resize() instead');
        _resizeMap(payload);
        break;

      case 'map.restore':
        if (_devMode) console.warn('GameState: map.restore is deprecated — use MapEngine for tile state');
        _restoreMap(payload);
        break;

      // ── Token ────────────────────────────────────────────────────────
      case 'token.add':
        _addToken(payload);
        _pushHistory(type, payload, {
          type: 'token.remove', payload: { id: payload.id },
        });
        break;

      case 'token.remove':
        inverseData = _removeToken(payload);
        if (inverseData) {
          _pushHistory(type, payload, {
            type: 'token.add', payload: inverseData.removed,
          });
        }
        break;

      case 'token.removeByCharId':
        inverseData = _removeTokenByCharId(payload);
        if (inverseData) {
          _pushHistory(type, payload, {
            type: 'token.add', payload: inverseData.removed,
          });
        }
        break;

      case 'token.setPosition':
        inverseData = _setTokenPosition(payload);
        if (inverseData) {
          _pushHistory(type, payload, {
            type: 'token.setPosition',
            payload: { id: payload.id, x: inverseData.prevX, y: inverseData.prevY },
          });
        }
        break;

      case 'token.setHP':
        inverseData = _setTokenHP(payload);
        if (inverseData) {
          _pushHistory(type, payload, {
            type: 'token.setHP',
            payload: { id: payload.id, hp: inverseData.prevHp },
          });
        }
        break;

      case 'token.update':
        inverseData = _updateToken(payload);
        if (inverseData) {
          _pushHistory(type, payload, {
            type: 'token.update',
            payload: { id: payload.id, ...inverseData.prev },
          });
        }
        break;

      case 'token.bulkSet':
        _bulkSetTokens(payload);
        break;

      // ── Selection ────────────────────────────────────────────────────
      case 'selection.set':
        inverseData = _setSelection(payload);
        if (inverseData) {
          _pushHistory(type, payload, {
            type: 'selection.set',
            payload: { tokenId: inverseData.prev },
          });
        }
        break;

      case 'selection.setHoveredTile':
        _setHoveredTile(payload);
        break;

      // ── Combat ───────────────────────────────────────────────────────
      case 'combat.setState':
        inverseData = _setCombatState(payload);
        if (inverseData) {
          _pushHistory(type, payload, {
            type: 'combat.setState', payload: inverseData.prev,
          });
        }
        break;

      case 'combat.setBudget':
        _setCombatBudget(payload);
        break;

      case 'combat.useAction':
        _useCombatAction(payload);
        break;

      case 'combat.addCondition':
        _addCondition(payload);
        break;

      case 'combat.removeCondition':
        _removeCondition(payload);
        break;

      case 'combat.clearBudgets':
        _clearCombatBudgets();
        break;

      default:
        if (_devMode) console.warn('GameState: Unknown action type:', type);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  TRANSACTION SYSTEM
  // ════════════════════════════════════════════════════════════════════════

  /** Begin a transaction — events are deferred until endTransaction(). */
  function beginTransaction() {
    _inTransaction = true;
    _pendingEvents.length = 0;
  }

  /** End a transaction — emit consolidated, deduplicated events. */
  function endTransaction() {
    _inTransaction = false;

    // Deduplicate pending events by type+id
    const consolidated = new Map();
    for (const evt of _pendingEvents) {
      const key = evt.id !== undefined
        ? `${evt.event}:${evt.id}`
        : evt.event;
      consolidated.set(key, evt);
    }
    _pendingEvents.length = 0;

    // Clear per-tick dedup so consolidated events can fire
    _emittedThisTick.clear();

    for (const evt of consolidated.values()) {
      _doEmit(evt.event, evt.payload);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  EVENT EMISSION — Deduplication + chain detection
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Emit a state change event (internal use only).
   * Respects transactions, deduplication, and chain limits.
   */
  function _emitChange(event, payload) {
    if (_inTransaction) {
      _pendingEvents.push({
        event,
        payload,
        id: payload && payload.id,
      });
      return;
    }
    _doEmit(event, payload);
  }

  function _doEmit(event, payload) {
    if (!_EventBus) return;

    // ── Per-tick deduplication ──────────────────────────────────────────
    const dedupeKey = payload && payload.id !== undefined
      ? `${event}:${payload.id}`
      : event;

    if (_emittedThisTick.has(dedupeKey)) return;
    _emittedThisTick.set(dedupeKey, true);
    _scheduleTickCleanup();

    // ── Event chain depth tracking ─────────────────────────────────────
    _eventChainDepth++;
    if (_eventChainDepth > MAX_CHAIN_DEPTH) {
      if (_devMode) {
        console.error(
          `GameState: Event chain depth exceeded (${_eventChainDepth}). ` +
          `Possible infinite loop detected. Event: ${event}`
        );
      }
      _eventChainDepth--;
      return;
    }

    // ── Per-type count tracking ────────────────────────────────────────
    _eventCountsThisChain[event] = (_eventCountsThisChain[event] || 0) + 1;
    if (_eventCountsThisChain[event] > MAX_EVENT_PER_TYPE) {
      if (_devMode) {
        console.error(
          `GameState: Event type "${event}" fired ${_eventCountsThisChain[event]} ` +
          `times in one chain. Halting chain.`
        );
      }
      _eventChainDepth--;
      return;
    }

    _EventBus.emit(event, payload);
    _eventChainDepth--;
  }

  function _scheduleTickCleanup() {
    if (_tickCleanupScheduled) return;
    _tickCleanupScheduled = true;

    const cleanup = () => {
      _emittedThisTick.clear();
      _eventCountsThisChain = {};
      _eventChainDepth      = 0;
      _tickCleanupScheduled = false;
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(cleanup);
    } else if (typeof Promise !== 'undefined') {
      Promise.resolve().then(cleanup);
    } else {
      // Fallback: clear immediately after current synchronous execution
      cleanup();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  HISTORY — Action-based with inverse schema
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Push a history entry with action and its inverse.
   * Skipped during undo/redo operations.
   * @param {string} type - Action type
   * @param {object} payload - Action payload
   * @param {object} inverse - Inverse action { type, payload }
   */
  function _pushHistory(type, payload, inverse) {
    if (_isUndoRedo) return;

    // Truncate any redo history beyond current index
    if (_historyIndex < _history.length - 1) {
      _history.splice(_historyIndex + 1);
    }

    _history.push({ type, payload, inverse });
    _historyIndex = _history.length - 1;

    // Enforce max history size
    if (_history.length > MAX_HISTORY) {
      _history.shift();
      _historyIndex = _history.length - 1;
    }
  }

  /** Undo the last action by applying its inverse. */
  function undo() {
    if (_historyIndex < 0 || _history.length === 0) return false;

    const entry = _history[_historyIndex];
    _historyIndex--;

    // Apply inverse action directly (bypass queue to avoid re-recording)
    _isUndoRedo = true;
    _executeAction(entry.inverse);
    _isUndoRedo = false;
    return true;
  }

  /** Redo a previously undone action. */
  function redo() {
    if (_historyIndex >= _history.length - 1) return false;

    _historyIndex++;
    const entry = _history[_historyIndex];

    // Re-apply original action directly
    _isUndoRedo = true;
    _executeAction({ type: entry.type, payload: entry.payload });
    _isUndoRedo = false;
    return true;
  }

  function canUndo() { return _historyIndex >= 0; }
  function canRedo() { return _historyIndex < _history.length - 1; }

  /** Get history entries (safe copies). */
  function getHistory() {
    return _history.map(h => ({
      type:    h.type,
      payload: { ...h.payload },
      inverse: { type: h.inverse.type, payload: { ...h.inverse.payload } },
    }));
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DIRECT STATE ACCESS — For internal system use only
  //  These provide efficient read access without copying.
  //  Systems should use these for performance-critical paths.
  // ════════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════════
  //  RESET — For testing and initialization
  // ════════════════════════════════════════════════════════════════════════

  /** Toggle dev mode (for testing reference-leak protection). */
  function setDevMode(enabled) { _devMode = !!enabled; }

  /** Reset all state to initial values. */
  function reset() {
    _state.map.width  = 0;
    _state.map.height = 0;
    _state.map.tiles  = [];

    for (const key of Object.keys(_state.tokens)) {
      delete _state.tokens[key];
    }

    _state.combat.active           = false;
    _state.combat.round            = 1;
    _state.combat.turnOrder        = [];
    _state.combat.currentTurnIndex = 0;
    for (const key of Object.keys(_state.combat.actionBudgets)) {
      delete _state.combat.actionBudgets[key];
    }
    // Keep conditions across resets (matching CombatSystem behavior)

    _state.selection.selectedTokenId = null;
    _state.selection.hoveredTile     = null;

    _actionQueue.length = 0;
    _processing         = false;
    _inTransaction      = false;
    _pendingEvents.length = 0;
    _history.length     = 0;
    _historyIndex       = -1;
    _isUndoRedo         = false;
    _emittedThisTick.clear();
    _eventChainDepth      = 0;
    _eventCountsThisChain = {};
  }

  // ════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════════════

  return {
    // ── Read Access ───────────────────────────────────────────────────
    getState,
    getToken,
    getAllTokens,
    getTokensArray,
    getMapTile,
    getMapDimensions,
    getCombat,
    getSelection,

    // ── Mutation (single entry point) ────────────────────────────────
    applyAction,

    // ── Transaction ──────────────────────────────────────────────────
    beginTransaction,
    endTransaction,

    // ── History ──────────────────────────────────────────────────────
    undo,
    redo,
    canUndo,
    canRedo,
    getHistory,

    // ── Reset ────────────────────────────────────────────────────────
    reset,

    // ── Safe Internal Access ─────────────────────────────────────────
    setDevMode,
    getCombatBudget,
    getCombatConditions,
    getMapTilesRaw,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameState;
}
