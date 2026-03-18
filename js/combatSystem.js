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

const _resolvedGameState2 = (() => {
  if (typeof GameState !== 'undefined') return GameState;
  if (typeof require === 'function') {
    try { return require('./engine/GameState.js'); } catch (e) { return null; }
  }
  return null;
})();

const CombatSystem = (() => {
  'use strict';

  const _GS = _resolvedGameState2;

  /** D&D 5e condition list. */
  const CONDITIONS = [
    'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
    'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
    'prone', 'restrained', 'stunned', 'unconscious', 'exhaustion',
  ];

  let _onUpdate = null;   // (snapshot) => void

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

    _GS.applyAction({ type: 'combat.setState', payload: {
      active: true,
      turnOrder: order,
      currentTurnIndex: 0,
      round: 1,
    }});

    // Initialise action budgets for all participants
    for (const p of order) {
      _GS.applyAction({ type: 'combat.setBudget', payload: {
        tokenId: p.id,
        budget: _defaultBudget(),
      }});
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
    const cs = _GS.getCombat();
    if (!cs.active || cs.turnOrder.length === 0) return null;

    let newIndex = (cs.currentTurnIndex + 1) % cs.turnOrder.length;
    let newRound = cs.round;
    if (newIndex === 0) newRound++;

    _GS.applyAction({ type: 'combat.setState', payload: {
      currentTurnIndex: newIndex,
      round: newRound,
    }});

    // Reset action budget for the new active participant
    const cur = getCurrentParticipant();
    if (cur) {
      _GS.applyAction({ type: 'combat.setBudget', payload: {
        tokenId: cur.id,
        budget: _defaultBudget(),
      }});
    }

    _notify();
    return cur;
  }

  /** End combat and reset state. */
  function endCombat() {
    _GS.applyAction({ type: 'combat.setState', payload: {
      active: false,
      turnOrder: [],
      currentTurnIndex: 0,
      round: 1,
    }});
    _GS.applyAction({ type: 'combat.clearBudgets', payload: {} });
    _notify();
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  function getCurrentParticipant() {
    const cs = _GS.getCombat();
    if (!cs.active || cs.turnOrder.length === 0) return null;
    return cs.turnOrder[cs.currentTurnIndex] || null;
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
    const budget = _GS.getCombatBudget(tokenId);
    if (!budget || !(cost in budget)) return false;
    const amt = amount !== undefined ? amount : 1;
    if (budget[cost] < amt) return false;
    _GS.applyAction({ type: 'combat.useAction', payload: { tokenId, cost, amount: amt } });
    return true;
  }

  /**
   * Get remaining action economy for a token.
   * @param {number} tokenId
   * @returns {object|null} budget object or null
   */
  function getRemainingBudget(tokenId) {
    return _GS.getCombatBudget(tokenId);
  }

  // ── Conditions ────────────────────────────────────────────────────────────

  /**
   * Add a condition to a token.
   * @param {number} tokenId
   * @param {string} condition
   */
  function addCondition(tokenId, condition) {
    _GS.applyAction({ type: 'combat.addCondition', payload: { tokenId, condition } });
  }

  /**
   * Remove a condition from a token.
   * @param {number} tokenId
   * @param {string} condition
   */
  function removeCondition(tokenId, condition) {
    _GS.applyAction({ type: 'combat.removeCondition', payload: { tokenId, condition } });
  }

  /**
   * Get all conditions for a token.
   * @param {number} tokenId
   * @returns {string[]}
   */
  function getConditions(tokenId) {
    return _GS.getCombatConditions(tokenId);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  function _notify() {
    if (_onUpdate) {
      const cs = _GS.getCombat();
      _onUpdate({
        active: cs.active,
        round: cs.round,
        turnOrder: cs.turnOrder.map(p => ({ ...p })),
        currentTurn: cs.currentTurnIndex,
      });
    }
  }

  return {
    CONDITIONS,
    get combatState() {
      const cs = _GS.getCombat();
      return {
        active: cs.active,
        round: cs.round,
        turnOrder: cs.turnOrder,
        currentTurn: cs.currentTurnIndex,
      };
    },
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
