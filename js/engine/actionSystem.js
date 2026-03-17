/**
 * actionSystem.js – Action System
 *
 * Manages D&D action economy: registers actions, tracks per-turn budgets
 * (actions, bonus actions, reactions, movement), validates and executes
 * actions, and maintains an action log. Ships with pre-registered standard
 * D&D actions.
 *
 * @module ActionSystem
 */

const ActionSystem = (() => {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────

  /** Recognised action types. */
  const ACTION_TYPES = Object.freeze([
    'move', 'attack', 'spell', 'item', 'ability',
    'bonus', 'reaction', 'free', 'custom',
  ]);

  /** Cost categories consumed during a turn. */
  const COST = Object.freeze({
    ACTION:   'action',
    BONUS:    'bonus',
    REACTION: 'reaction',
    FREE:     'free',
    MOVEMENT: 'movement',
  });

  /** Default action economy budget per turn (5e standard). */
  const DEFAULT_BUDGET = Object.freeze({
    action:   1,
    bonus:    1,
    reaction: 1,
    movement: 30, // feet
  });

  // ── State ───────────────────────────────────────────────────────────────

  /** Registered actions: actionKey → config. */
  const _actions = new Map();

  /** Per-entity turn economy: entityId → { action, bonus, reaction, movement }. */
  const _budgets = new Map();

  /** Action log (newest first, capped). */
  const _log = [];
  const _LOG_MAX = 200;

  /** Action-executed hooks. */
  const _onActionCallbacks = [];

  // ── Entity resolver (stub, override externally if desired) ──────────────

  /**
   * Resolve an entity by ID. Defaults to returning a minimal stub.
   * Intended to be replaced with a real entity lookup at integration time.
   * @type {Function}
   */
  let _resolveEntity = function (id) { return { id }; };

  /**
   * Allow external code to provide entity resolution.
   * @param {Function} fn - (id) → entity or null.
   */
  function setEntityResolver(fn) {
    if (typeof fn === 'function') _resolveEntity = fn;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function _now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function _pushLog(entry) {
    _log.unshift(entry);
    if (_log.length > _LOG_MAX) _log.length = _LOG_MAX;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Register a new action.
   * @param {string} key - Unique action key.
   * @param {Object} config
   * @param {string}   config.name
   * @param {string}   [config.icon]
   * @param {string}   [config.type]      - One of ACTION_TYPES.
   * @param {string}   [config.cost]      - 'action' | 'bonus' | 'reaction' | 'free'.
   * @param {number}   [config.range]     - Range in tiles.
   * @param {string}   [config.fx]        - Particle preset name.
   * @param {string|Function} [config.animation]
   * @param {Function} [config.validate]  - (actor, target) → boolean.
   * @param {Function} [config.execute]   - (actor, target) → result.
   */
  function registerAction(key, config) {
    if (!key || !config) return;
    _actions.set(key, Object.assign({ key }, config));
  }

  /**
   * Unregister an action.
   * @param {string} key
   */
  function unregisterAction(key) {
    _actions.delete(key);
  }

  /**
   * Execute a registered action.
   * @param {string} actionKey
   * @param {*}      actorId
   * @param {*}      [targetId]
   * @returns {{ success: boolean, result?: *, reason?: string }}
   */
  function executeAction(actionKey, actorId, targetId) {
    const action = _actions.get(actionKey);
    if (!action) return { success: false, reason: 'Unknown action: ' + actionKey };

    const actor  = _resolveEntity(actorId);
    const target = targetId != null ? _resolveEntity(targetId) : null;

    // Validate
    if (typeof action.validate === 'function' && !action.validate(actor, target)) {
      return { success: false, reason: 'Validation failed for ' + actionKey };
    }

    // Check budget
    const budget = _budgets.get(actorId);
    const cost   = action.cost || COST.ACTION;
    if (budget && cost !== COST.FREE) {
      if (cost === COST.MOVEMENT) {
        const moveCost = action.movementCost || 5;
        if (budget.movement < moveCost) {
          return { success: false, reason: 'Not enough movement' };
        }
        budget.movement -= moveCost;
      } else if (budget[cost] !== undefined) {
        if (budget[cost] <= 0) {
          return { success: false, reason: 'No ' + cost + ' remaining' };
        }
        budget[cost]--;
      }
    }

    // Execute
    let result = null;
    if (typeof action.execute === 'function') {
      result = action.execute(actor, target);
    }

    const logEntry = {
      timestamp: _now(),
      actionKey,
      actorId,
      targetId: targetId != null ? targetId : null,
      result,
    };
    _pushLog(logEntry);

    // Notify hooks
    for (const cb of _onActionCallbacks) {
      cb(logEntry);
    }

    return { success: true, result };
  }

  /**
   * Get all actions currently available to an entity (budget-aware).
   * @param {*} actorId
   * @returns {Object[]} Array of action configs the entity can still perform.
   */
  function getAvailableActions(actorId) {
    const actor  = _resolveEntity(actorId);
    const budget = _budgets.get(actorId);
    const result = [];

    for (const action of _actions.values()) {
      // Budget check
      const cost = action.cost || COST.ACTION;
      if (budget && cost !== COST.FREE) {
        if (cost === COST.MOVEMENT) {
          if (budget.movement < (action.movementCost || 5)) continue;
        } else if (budget[cost] !== undefined && budget[cost] <= 0) {
          continue;
        }
      }

      // Validate check (skip if validate fails)
      if (typeof action.validate === 'function') {
        try { if (!action.validate(actor, null)) continue; } catch (_) { continue; }
      }

      result.push(action);
    }
    return result;
  }

  /**
   * Start a turn for an entity, resetting their action economy.
   * @param {*} entityId
   * @param {Object} [overrides] - Override default budget values.
   */
  function startTurn(entityId, overrides) {
    _budgets.set(entityId, Object.assign({}, DEFAULT_BUDGET, overrides || {}));
  }

  /**
   * End a turn for an entity (clears their budget).
   * @param {*} entityId
   */
  function endTurn(entityId) {
    _budgets.delete(entityId);
  }

  /**
   * Get the current budget for an entity.
   * @param {*} entityId
   * @returns {Object|undefined}
   */
  function getBudget(entityId) {
    return _budgets.get(entityId);
  }

  /**
   * Get the action log (newest first).
   * @param {number} [limit=50]
   * @returns {Object[]}
   */
  function getActionLog(limit) {
    return _log.slice(0, limit || 50);
  }

  /**
   * Register a callback that fires after any action is executed.
   * @param {Function} callback - Receives the log entry.
   */
  function onAction(callback) {
    if (typeof callback === 'function') _onActionCallbacks.push(callback);
  }

  /**
   * Unregister an onAction callback.
   * @param {Function} callback
   */
  function offAction(callback) {
    const idx = _onActionCallbacks.indexOf(callback);
    if (idx !== -1) _onActionCallbacks.splice(idx, 1);
  }

  /**
   * Remove all registered actions, budgets, and log entries.
   */
  function clear() {
    _actions.clear();
    _budgets.clear();
    _log.length = 0;
    _onActionCallbacks.length = 0;
  }

  // ── Pre-registered D&D actions ──────────────────────────────────────────

  /** @private */
  function _registerDefaults() {
    registerAction('move', {
      name: 'Move', icon: '🏃', type: 'move',
      cost: 'movement', movementCost: 5, range: 1,
      validate: function () { return true; },
      execute:  function (actor) { return { moved: true, actor: actor.id }; },
    });
    registerAction('attack', {
      name: 'Attack', icon: '⚔️', type: 'attack',
      cost: 'action', range: 1, fx: 'hit',
      validate: function (_actor, target) { return target != null; },
      execute:  function (actor, target) { return { attacker: actor.id, defender: target.id }; },
    });
    registerAction('dodge', {
      name: 'Dodge', icon: '🛡️', type: 'ability',
      cost: 'action', range: 0,
      validate: function () { return true; },
      execute:  function (actor) { return { dodging: true, actor: actor.id }; },
    });
    registerAction('dash', {
      name: 'Dash', icon: '💨', type: 'ability',
      cost: 'action', range: 0,
      validate: function () { return true; },
      execute:  function (actor) { return { dashing: true, actor: actor.id }; },
    });
    registerAction('disengage', {
      name: 'Disengage', icon: '↩️', type: 'ability',
      cost: 'action', range: 0,
      validate: function () { return true; },
      execute:  function (actor) { return { disengaged: true, actor: actor.id }; },
    });
    registerAction('help', {
      name: 'Help', icon: '🤝', type: 'ability',
      cost: 'action', range: 1,
      validate: function () { return true; },
      execute:  function (actor, target) { return { helper: actor.id, helped: target ? target.id : null }; },
    });
    registerAction('hide', {
      name: 'Hide', icon: '👤', type: 'ability',
      cost: 'action', range: 0,
      validate: function () { return true; },
      execute:  function (actor) { return { hiding: true, actor: actor.id }; },
    });
    registerAction('ready', {
      name: 'Ready', icon: '⏳', type: 'ability',
      cost: 'action', range: 0,
      validate: function () { return true; },
      execute:  function (actor) { return { readied: true, actor: actor.id }; },
    });
  }

  _registerDefaults();

  return {
    ACTION_TYPES,
    COST,
    DEFAULT_BUDGET,

    registerAction,
    unregisterAction,
    executeAction,
    getAvailableActions,
    startTurn,
    endTurn,
    getBudget,
    getActionLog,
    onAction,
    offAction,
    setEntityResolver,
    clear,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ActionSystem;
}
