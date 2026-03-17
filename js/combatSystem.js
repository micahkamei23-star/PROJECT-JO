/**
 * combatSystem.js – Combat Tracker
 * Manages initiative, turn order, round progression, action economy, and conditions.
 *
 * combatState = {
 *   active:      boolean,
 *   round:       number,
 *   turnOrder:   [{ id, name, avatar, initiative }],
 *   currentTurn: number   // index into turnOrder
 * }
 */

const CombatSystem = (() => {
  'use strict';

  /** D&D 5e condition list. */
  const CONDITIONS = [
    'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
    'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
    'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion',
  ];

  const _combatState = {
    active:      false,
    round:       1,
    turnOrder:   [],
    currentTurn: 0,
  };

  let _onUpdate = null;   // (snapshot) => void

  // Action economy per participant: tokenId → budget
  const _actionBudgets = {};
  // Conditions per token: tokenId → Set<string>
  const _conditions = {};

  function _defaultBudget() {
    return { actions: 1, bonus: 1, reaction: 1, movement: 30 };
  }

  // ── Initialise ─────────────────────────────────────────────────────────────

  function init(updateCallback) {
    _onUpdate = updateCallback;
  }

  // ── Combat flow ────────────────────────────────────────────────────────────

  /**
   * Roll d20 initiative for each token and start combat.
   * @param {Array}  tokens     – token objects from TokenSystem.getAll()
   * @param {Object} [modifiers] – optional map { tokenId: modifier }
   */
  function rollInitiativeForTokens(tokens, modifiers) {
    if (!tokens || tokens.length === 0) return [];

    const mods = modifiers || {};

    const order = tokens.map(t => ({
      id:         t.id,
      name:       t.name,
      avatar:     t.avatar,
      initiative: Math.floor(Math.random() * 20) + 1 + (mods[t.id] || 0),
    }));

    order.sort((a, b) => b.initiative - a.initiative);

    _combatState.turnOrder   = order;
    _combatState.currentTurn = 0;
    _combatState.round       = 1;
    _combatState.active      = true;

    // Initialise action budgets for all participants
    for (const p of order) {
      _actionBudgets[p.id] = _defaultBudget();
    }

    _notify();
    return order;
  }

  /**
   * Advance to the next participant's turn.
   * Increments round counter when the order wraps.
   * Resets the new participant's action budget.
   * @returns {object|null} The new current participant.
   */
  function nextTurn() {
    if (!_combatState.active || _combatState.turnOrder.length === 0) return null;

    _combatState.currentTurn =
      (_combatState.currentTurn + 1) % _combatState.turnOrder.length;

    if (_combatState.currentTurn === 0) _combatState.round++;

    // Reset action budget for the new active participant
    const cur = getCurrentParticipant();
    if (cur) {
      _actionBudgets[cur.id] = _defaultBudget();
    }

    _notify();
    return cur;
  }

  /** End combat and reset state. */
  function endCombat() {
    _combatState.active      = false;
    _combatState.turnOrder   = [];
    _combatState.currentTurn = 0;
    _combatState.round       = 1;
    // Clear action budgets (keep conditions across combats)
    for (const key of Object.keys(_actionBudgets)) {
      delete _actionBudgets[key];
    }
    _notify();
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  function getCurrentParticipant() {
    if (!_combatState.active || _combatState.turnOrder.length === 0) return null;
    return _combatState.turnOrder[_combatState.currentTurn] || null;
  }

  function isActiveTurn(tokenId) {
    const cur = getCurrentParticipant();
    return cur ? cur.id === tokenId : false;
  }

  // ── Action Economy ────────────────────────────────────────────────────────

  /**
   * Consume an action resource for a token.
   * @param {number} tokenId
   * @param {string} cost – 'actions', 'bonus', 'reaction', or 'movement'
   * @param {number} [amount=1] – amount to consume (movement may use more)
   * @returns {boolean} true if the resource was successfully consumed
   */
  function useAction(tokenId, cost, amount) {
    const budget = _actionBudgets[tokenId];
    if (!budget || !(cost in budget)) return false;
    const amt = amount !== undefined ? amount : 1;
    if (budget[cost] < amt) return false;
    budget[cost] -= amt;
    return true;
  }

  /**
   * Get remaining action economy for a token.
   * @param {number} tokenId
   * @returns {object|null} budget object or null
   */
  function getRemainingBudget(tokenId) {
    return _actionBudgets[tokenId] ? { ..._actionBudgets[tokenId] } : null;
  }

  // ── Conditions ────────────────────────────────────────────────────────────

  /**
   * Add a condition to a token.
   * @param {number} tokenId
   * @param {string} condition
   */
  function addCondition(tokenId, condition) {
    if (!_conditions[tokenId]) _conditions[tokenId] = new Set();
    _conditions[tokenId].add(condition);
  }

  /**
   * Remove a condition from a token.
   * @param {number} tokenId
   * @param {string} condition
   */
  function removeCondition(tokenId, condition) {
    if (!_conditions[tokenId]) return;
    _conditions[tokenId].delete(condition);
  }

  /**
   * Get all conditions for a token.
   * @param {number} tokenId
   * @returns {string[]}
   */
  function getConditions(tokenId) {
    return _conditions[tokenId] ? [..._conditions[tokenId]] : [];
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  function _notify() {
    if (_onUpdate) {
      _onUpdate({
        ..._combatState,
        turnOrder: _combatState.turnOrder.map(p => ({ ...p })),
      });
    }
  }

  return {
    CONDITIONS,
    get combatState() { return _combatState; },
    init,
    rollInitiativeForTokens,
    nextTurn,
    endCombat,
    getCurrentParticipant,
    isActiveTurn,
    // Action economy
    useAction,
    getRemainingBudget,
    // Conditions
    addCondition,
    removeCondition,
    getConditions,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CombatSystem;
}
