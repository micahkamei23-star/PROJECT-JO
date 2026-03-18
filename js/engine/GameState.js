/**
 * GameState.js – Centralized State Authority (Phase 5)
 *
 * Single source of truth for all persistent, shared game data.
 * Enforces unidirectional data flow:
 *   Input → InteractionManager → EventBus → Systems → GameState → Renderers/UI
 *
 * NON-NEGOTIABLE:
 *   - All systems MUST read from GameState
 *   - All persistent updates MUST go through GameState
 *   - Renderers/UI MUST NOT hold authoritative state
 *
 * @module GameState
 */

const GameState = (() => {
  'use strict';

  // ── Dependencies (resolved lazily for CommonJS / browser IIFE compat) ─────
  let _eventBus = null;
  function _getEventBus() {
    if (_eventBus) return _eventBus;
    try {
      if (typeof globalThis !== 'undefined' && globalThis.EventBus) {
        _eventBus = globalThis.EventBus;
        return _eventBus;
      }
    } catch (_) { /* noop */ }
    try { _eventBus = require('./eventBus.js'); } catch (_) { /* noop */ }
    return _eventBus;
  }

  // ── Dev-mode flag ─────────────────────────────────────────────────────────
  const DEV = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production');

  // ── Internal authoritative state ──────────────────────────────────────────
  const _state = {
    map: {
      width: 20,
      height: 15,
      tiles: [],          // 2-D grid: [row][col] = { type, walkable }
    },
    tokens: {},           // { [id]: token object }
    combat: {
      active: false,
      round: 1,
      turnOrder: [],      // [{ id, name, avatar, initiative }]
      currentTurnIndex: 0,
    },
    selection: {
      selectedTokenId: null,
      hoveredTile: null,
    },
  };

  // ── Action queue (FIFO, deterministic) ────────────────────────────────────
  const _actionQueue = [];
  let _processing = false;

  // ── Transaction batching ──────────────────────────────────────────────────
  let _inTransaction = false;
  const _pendingEvents = new Map(); // eventName → latest payload

  // ── Per-tick event deduplication & loop protection ────────────────────────
  let _tickEventCounts = {};   // eventName → count this tick
  let _tickId = 0;
  const MAX_EVENT_CHAIN = 8;

  function _resetTickTracking() {
    _tickId++;
    _tickEventCounts = {};
  }

  // ── History (action-based, lightweight) ───────────────────────────────────
  const MAX_HISTORY = 50;
  const _history = [];    // [{ type, payload, inverse }]
  let _historyIndex = -1; // points to the last applied entry

  function _pushHistory(entry) {
    // Discard any redo-able entries beyond current index
    if (_historyIndex < _history.length - 1) {
      _history.splice(_historyIndex + 1);
    }
    _history.push(entry);
    if (_history.length > MAX_HISTORY) {
      _history.shift();
    } else {
      _historyIndex++;
    }
  }

  // ── Safe-state access ─────────────────────────────────────────────────────

  /**
   * Deep-freeze helper for dev mode.
   */
  function _deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(name => {
      const val = obj[name];
      if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
        _deepFreeze(val);
      }
    });
    return obj;
  }

  /**
   * Return a read-safe snapshot of the full state.
   * In dev mode the returned structure is frozen (mutations throw).
   */
  function getState() {
    const copy = {
      map: {
        width: _state.map.width,
        height: _state.map.height,
        tiles: _state.map.tiles.map(row => row.map(t => ({ ...t }))),
      },
      tokens: _shallowCopyTokens(),
      combat: {
        active: _state.combat.active,
        round: _state.combat.round,
        turnOrder: _state.combat.turnOrder.map(p => ({ ...p })),
        currentTurnIndex: _state.combat.currentTurnIndex,
      },
      selection: { ..._state.selection },
    };
    if (DEV) _deepFreeze(copy);
    return copy;
  }

  /** Shallow-copy the tokens map into a plain object with copied values. */
  function _shallowCopyTokens() {
    const out = {};
    for (const id of Object.keys(_state.tokens)) {
      const t = _state.tokens[id];
      out[id] = {
        ...t,
        statusEffects: [...(t.statusEffects || [])],
        conditions: [...(t.conditions || [])],
      };
    }
    return out;
  }

  // ── Event emission ────────────────────────────────────────────────────────

  function _emitEvent(eventName, payload) {
    if (_inTransaction) {
      _pendingEvents.set(eventName, payload);
      return;
    }
    // Per-tick deduplication & loop detection
    _tickEventCounts[eventName] = (_tickEventCounts[eventName] || 0) + 1;
    if (_tickEventCounts[eventName] > MAX_EVENT_CHAIN) {
      if (DEV) {
        console.error(`[GameState] Event loop detected: "${eventName}" exceeded ${MAX_EVENT_CHAIN} emissions per tick – halted.`);
      }
      return;
    }
    const bus = _getEventBus();
    if (bus) bus.emit(eventName, payload);
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  function beginTransaction() {
    _inTransaction = true;
    _pendingEvents.clear();
  }

  function endTransaction() {
    _inTransaction = false;
    // Emit consolidated events
    for (const [eventName, payload] of _pendingEvents) {
      _emitEvent(eventName, payload);
    }
    _pendingEvents.clear();
  }

  // ── Internal mutation methods (PRIVATE — only called via applyAction) ─────

  function _setTokenPosition(id, x, y) {
    const token = _state.tokens[id];
    if (!token) {
      if (DEV) console.warn(`[GameState] setTokenPosition: token ${id} not found`);
      return;
    }
    if (typeof x !== 'number' || typeof y !== 'number') {
      if (DEV) console.warn(`[GameState] setTokenPosition: invalid coords (${x}, ${y})`);
      return;
    }
    const clampedX = Math.max(0, Math.min(_state.map.width - 1, x));
    const clampedY = Math.max(0, Math.min(_state.map.height - 1, y));
    if (token.x === clampedX && token.y === clampedY) return; // no-op
    const prev = { x: token.x, y: token.y };
    token.x = clampedX;
    token.y = clampedY;
    _emitEvent('state.token.updated', { id, changes: { x: clampedX, y: clampedY } });
    return { prev };
  }

  function _setTokenHP(id, hp) {
    const token = _state.tokens[id];
    if (!token) {
      if (DEV) console.warn(`[GameState] setTokenHP: token ${id} not found`);
      return;
    }
    if (typeof hp !== 'number') {
      if (DEV) console.warn(`[GameState] setTokenHP: invalid hp ${hp}`);
      return;
    }
    const clamped = Math.max(0, Math.min(token.maxHp, hp));
    if (token.hp === clamped) return; // no-op
    const prev = token.hp;
    token.hp = clamped;
    _emitEvent('state.token.updated', { id, changes: { hp: clamped } });
    return { prev };
  }

  function _setSelection(tokenId) {
    if (tokenId !== null && !_state.tokens[tokenId]) {
      if (DEV) console.warn(`[GameState] setSelection: token ${tokenId} not found`);
      return;
    }
    if (_state.selection.selectedTokenId === tokenId) return; // no-op
    const prev = _state.selection.selectedTokenId;
    _state.selection.selectedTokenId = tokenId;
    _emitEvent('state.selection.changed', { selectedTokenId: tokenId });
    return { prev };
  }

  function _setHoveredTile(tile) {
    const prev = _state.selection.hoveredTile;
    // No-op check
    if (prev === tile) return;
    if (prev && tile && prev.row === tile.row && prev.col === tile.col) return;
    _state.selection.hoveredTile = tile;
    // Hovered tile is transient enough we don't need an event
    return { prev };
  }

  function _setTile(row, col, type) {
    if (row < 0 || row >= _state.map.height || col < 0 || col >= _state.map.width) {
      if (DEV) console.warn(`[GameState] setTile: out of bounds (${row}, ${col})`);
      return;
    }
    const actualType = (!type || type === 'empty') ? null : type;
    const current = _state.map.tiles[row] && _state.map.tiles[row][col];
    if (current && current.type === actualType) return; // no-op
    const prev = current ? { ...current } : null;
    const walkable = _getTileWalkable(actualType);
    _state.map.tiles[row][col] = { type: actualType, walkable };
    _emitEvent('state.map.updated', { row, col, type: actualType });
    return { prev };
  }

  function _getTileWalkable(type) {
    // Mirror MapEngine.TILE_DEFS logic
    const TILE_DEFS = {
      floor: true, stone: true, wall: false, water: false,
      door: true, trap: true, grass: true, lava: false,
      stairs: true, chest: true,
    };
    if (!type) return true;
    return TILE_DEFS[type] !== undefined ? TILE_DEFS[type] : true;
  }

  function _addToken(token) {
    if (!token || !token.id) {
      if (DEV) console.warn('[GameState] addToken: invalid token');
      return;
    }
    _state.tokens[token.id] = { ...token, statusEffects: [...(token.statusEffects || [])], conditions: [...(token.conditions || [])] };
    _emitEvent('state.token.updated', { id: token.id, changes: token });
    return { added: token.id };
  }

  function _removeToken(id) {
    if (!_state.tokens[id]) {
      if (DEV) console.warn(`[GameState] removeToken: token ${id} not found`);
      return;
    }
    const prev = { ..._state.tokens[id], statusEffects: [...(_state.tokens[id].statusEffects || [])], conditions: [...(_state.tokens[id].conditions || [])] };
    delete _state.tokens[id];
    // Also clear selection if this token was selected
    if (_state.selection.selectedTokenId === id) {
      _state.selection.selectedTokenId = null;
      _emitEvent('state.selection.changed', { selectedTokenId: null });
    }
    _emitEvent('state.token.updated', { id, removed: true });
    return { prev };
  }

  function _setTokenField(id, field, value) {
    const token = _state.tokens[id];
    if (!token) {
      if (DEV) console.warn(`[GameState] setTokenField: token ${id} not found`);
      return;
    }
    const prev = token[field];
    // Array field: shallow copy for comparison
    if (Array.isArray(value)) {
      if (Array.isArray(prev) && prev === value) return; // same reference
      if (Array.isArray(prev) && prev.length === value.length && prev.every((v, i) => v === value[i])) return;
      token[field] = [...value];
    } else {
      if (prev === value) return;
      token[field] = value;
    }
    _emitEvent('state.token.updated', { id, changes: { [field]: value } });
    return { prev };
  }

  // ── Combat mutations ──────────────────────────────────────────────────────

  function _setCombatState(combatData) {
    const prev = {
      active: _state.combat.active,
      round: _state.combat.round,
      turnOrder: _state.combat.turnOrder.map(p => ({ ...p })),
      currentTurnIndex: _state.combat.currentTurnIndex,
    };
    if (combatData.active !== undefined) _state.combat.active = combatData.active;
    if (combatData.round !== undefined) _state.combat.round = combatData.round;
    if (combatData.turnOrder !== undefined) {
      _state.combat.turnOrder = combatData.turnOrder.map(p => ({ ...p }));
    }
    if (combatData.currentTurnIndex !== undefined) {
      _state.combat.currentTurnIndex = combatData.currentTurnIndex;
    }
    // Simple change check
    const changed = JSON.stringify(prev) !== JSON.stringify(_state.combat);
    if (!changed) return;
    _emitEvent('state.combat.updated', {
      active: _state.combat.active,
      round: _state.combat.round,
      currentTurnIndex: _state.combat.currentTurnIndex,
    });
    return { prev };
  }

  // ── Map mutations ─────────────────────────────────────────────────────────

  function _initMap(width, height) {
    const w = Math.max(5, Math.min(50, width || 20));
    const h = Math.max(5, Math.min(30, height || 15));
    _state.map.width = w;
    _state.map.height = h;
    _state.map.tiles = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => ({ type: null, walkable: true }))
    );
    _emitEvent('state.map.updated', { reset: true, width: w, height: h });
    return { prev: null };
  }

  // ── Action dispatcher ─────────────────────────────────────────────────────

  /**
   * The ONLY public mutation entry point.
   * All state changes MUST go through this method.
   * @param {{ type: string, payload: object }} action
   */
  function applyAction(action) {
    if (!action || !action.type) {
      if (DEV) console.warn('[GameState] applyAction: invalid action', action);
      return;
    }

    if (_processing) {
      // Queue actions triggered during processing
      _actionQueue.push(action);
      return;
    }

    _actionQueue.push(action);
    _processQueue();
  }

  function _processQueue() {
    if (_processing) return;
    _processing = true;
    _resetTickTracking();

    while (_actionQueue.length > 0) {
      const action = _actionQueue.shift();
      const result = _executeAction(action);
      // Record in history if the action produced a change
      if (result && result.inverse) {
        _pushHistory({
          type: action.type,
          payload: action.payload,
          inverse: result.inverse,
        });
      }
    }

    _processing = false;
  }

  function _executeAction(action) {
    const { type, payload } = action;
    let result;

    switch (type) {
      case 'token.setPosition': {
        const r = _setTokenPosition(payload.id, payload.x, payload.y);
        if (r) return { inverse: { type: 'token.setPosition', payload: { id: payload.id, x: r.prev.x, y: r.prev.y } } };
        break;
      }
      case 'token.setHP': {
        const r = _setTokenHP(payload.id, payload.hp);
        if (r) return { inverse: { type: 'token.setHP', payload: { id: payload.id, hp: r.prev } } };
        break;
      }
      case 'token.setField': {
        const r = _setTokenField(payload.id, payload.field, payload.value);
        if (r) return { inverse: { type: 'token.setField', payload: { id: payload.id, field: payload.field, value: r.prev } } };
        break;
      }
      case 'token.add': {
        const r = _addToken(payload.token);
        if (r) return { inverse: { type: 'token.remove', payload: { id: r.added } } };
        break;
      }
      case 'token.remove': {
        const r = _removeToken(payload.id);
        if (r) return { inverse: { type: 'token.add', payload: { token: r.prev } } };
        break;
      }
      case 'selection.set': {
        const r = _setSelection(payload.tokenId);
        if (r) return { inverse: { type: 'selection.set', payload: { tokenId: r.prev } } };
        break;
      }
      case 'selection.setHoveredTile': {
        _setHoveredTile(payload.tile);
        break; // no history for hover
      }
      case 'map.setTile': {
        const r = _setTile(payload.row, payload.col, payload.type);
        if (r) return { inverse: { type: 'map.setTile', payload: { row: payload.row, col: payload.col, type: r.prev ? r.prev.type : null } } };
        break;
      }
      case 'map.init': {
        _initMap(payload.width, payload.height);
        break; // init is not undoable
      }
      case 'combat.setState': {
        const r = _setCombatState(payload);
        if (r) return { inverse: { type: 'combat.setState', payload: r.prev } };
        break;
      }
      default:
        if (DEV) console.warn(`[GameState] Unknown action type: "${type}"`);
    }
    return null;
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  function undo() {
    if (_historyIndex < 0) return false;
    const entry = _history[_historyIndex];
    _historyIndex--;
    // Apply the inverse directly (bypass queue to avoid re-recording)
    _resetTickTracking();
    _executeAction(entry.inverse);
    return true;
  }

  function redo() {
    if (_historyIndex >= _history.length - 1) return false;
    _historyIndex++;
    const entry = _history[_historyIndex];
    _resetTickTracking();
    _executeAction({ type: entry.type, payload: entry.payload });
    return true;
  }

  function canUndo() { return _historyIndex >= 0; }
  function canRedo() { return _historyIndex < _history.length - 1; }

  // ── Direct internal state access (for system integration) ─────────────────
  // These are intentionally provided for systems that need to read frequently
  // (e.g., every frame during render). They return copies or frozen refs.

  /** Get a single token by id (copy). */
  function getToken(id) {
    const t = _state.tokens[id];
    if (!t) return null;
    return { ...t, statusEffects: [...(t.statusEffects || [])], conditions: [...(t.conditions || [])] };
  }

  /** Get all tokens as an array (copies). */
  function getAllTokens() {
    return Object.values(_state.tokens).map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
      conditions: [...(t.conditions || [])],
    }));
  }

  /** Get the internal token reference — only for read during render loops.
   *  Returns the live object. Systems MUST NOT mutate this. */
  function _getTokenRef(id) {
    return _state.tokens[id] || null;
  }

  /** Get all token refs — for render loops only. MUST NOT mutate. */
  function _getTokenRefs() {
    return Object.values(_state.tokens);
  }

  /** Get tile at (row, col) or null. */
  function getTile(row, col) {
    if (row < 0 || row >= _state.map.height || col < 0 || col >= _state.map.width) return null;
    const t = _state.map.tiles[row] && _state.map.tiles[row][col];
    return t ? { ...t } : null;
  }

  /** Get map dimensions. */
  function getMapSize() {
    return { width: _state.map.width, height: _state.map.height };
  }

  /** Get combat state (copy). */
  function getCombatState() {
    return {
      active: _state.combat.active,
      round: _state.combat.round,
      turnOrder: _state.combat.turnOrder.map(p => ({ ...p })),
      currentTurnIndex: _state.combat.currentTurnIndex,
    };
  }

  /** Get selection state (copy). */
  function getSelection() {
    return { ..._state.selection };
  }

  // ── Reset (for testing) ───────────────────────────────────────────────────

  function reset() {
    _state.map.width = 20;
    _state.map.height = 15;
    _state.map.tiles = [];
    _state.tokens = {};
    _state.combat.active = false;
    _state.combat.round = 1;
    _state.combat.turnOrder = [];
    _state.combat.currentTurnIndex = 0;
    _state.selection.selectedTokenId = null;
    _state.selection.hoveredTile = null;
    _history.length = 0;
    _historyIndex = -1;
    _actionQueue.length = 0;
    _processing = false;
    _inTransaction = false;
    _pendingEvents.clear();
    _resetTickTracking();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    // State reads (safe copies)
    getState,
    getToken,
    getAllTokens,
    getTile,
    getMapSize,
    getCombatState,
    getSelection,

    // Internal refs for render performance (systems must not mutate)
    _getTokenRef,
    _getTokenRefs,

    // Sole mutation entry point
    applyAction,

    // Transactions
    beginTransaction,
    endTransaction,

    // History
    undo,
    redo,
    canUndo,
    canRedo,

    // Reset (testing)
    reset,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameState;
}
