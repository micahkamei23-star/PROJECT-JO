/**
 * combatSystem.js – Combat Tracker
 * Manages initiative, turn order, and round progression.
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

  const _combatState = {
    active:      false,
    round:       1,
    turnOrder:   [],
    currentTurn: 0,
  };

  let _onUpdate = null;   // (snapshot) => void

  // ── Initialise ─────────────────────────────────────────────────────────────

  function init(updateCallback) {
    _onUpdate = updateCallback;
  }

  // ── Combat flow ────────────────────────────────────────────────────────────

  /**
   * Roll d20 initiative for each token and start combat.
   * @param {Array}  tokens  – token objects from TokenSystem.getAll()
   */
  function rollInitiativeForTokens(tokens) {
    if (!tokens || tokens.length === 0) return [];

    const order = tokens.map(t => ({
      id:         t.id,
      name:       t.name,
      avatar:     t.avatar,
      initiative: Math.floor(Math.random() * 20) + 1,
    }));

    order.sort((a, b) => b.initiative - a.initiative);

    _combatState.turnOrder   = order;
    _combatState.currentTurn = 0;
    _combatState.round       = 1;
    _combatState.active      = true;

    _notify();
    return order;
  }

  /**
   * Advance to the next participant's turn.
   * Increments round counter when the order wraps.
   * @returns {object|null} The new current participant.
   */
  function nextTurn() {
    if (!_combatState.active || _combatState.turnOrder.length === 0) return null;

    _combatState.currentTurn =
      (_combatState.currentTurn + 1) % _combatState.turnOrder.length;

    if (_combatState.currentTurn === 0) _combatState.round++;

    _notify();
    return getCurrentParticipant();
  }

  /** End combat and reset state. */
  function endCombat() {
    _combatState.active      = false;
    _combatState.turnOrder   = [];
    _combatState.currentTurn = 0;
    _combatState.round       = 1;
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
    get combatState() { return _combatState; },
    init,
    rollInitiativeForTokens,
    nextTurn,
    endCombat,
    getCurrentParticipant,
    isActiveTurn,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CombatSystem;
}
