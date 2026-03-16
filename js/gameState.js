/**
 * gameState.js – Centralized Game State
 *
 * Single source of truth for all VTT systems.
 *
 * gameState = {
 *   map:        { width, height, tiles[], fog[] }
 *   characters: CharacterData[]
 *   tokens:     TokenData[]
 *   combat:     { active, turnOrder[], currentTurnIndex, round }
 *   diceHistory: RollResult[]
 *   inventory:  Item[]
 * }
 *
 * All systems read from and write to this object via the provided mutators.
 * Observers can subscribe to state changes via onChange().
 */

const GameState = (() => {
  'use strict';

  const _state = {
    map: {
      width:    20,
      height:   15,
      tiles:    [],
      fog:      [],
      lighting: [],
    },
    characters:  [],
    tokens:      [],
    combat: {
      active:           false,
      turnOrder:        [],
      currentTurnIndex: 0,
      round:            1,
    },
    diceHistory: [],
    inventory:   [],
  };

  const _listeners = [];

  // ── Internal notify ─────────────────────────────────────────────────────────

  function _notify(section) {
    _listeners.forEach(fn => {
      try { fn(section, _state); } catch (err) {
        console.error('[GameState] Listener error in section "' + section + '":', err);
      }
    });
  }

  // ── Subscription ────────────────────────────────────────────────────────────

  /**
   * Register a callback invoked whenever state changes.
   * @param {(section: string, state: object) => void} fn
   */
  function onChange(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
  }

  // ── Map ─────────────────────────────────────────────────────────────────────

  function updateMap(mapData) {
    if (!mapData) return;
    Object.assign(_state.map, mapData);
    _notify('map');
  }

  // ── Characters ──────────────────────────────────────────────────────────────

  function setCharacters(characters) {
    _state.characters = Array.isArray(characters) ? characters : [];
    _notify('characters');
  }

  function addCharacter(character) {
    if (!character) return;
    _state.characters.push(character);
    _notify('characters');
  }

  function removeCharacter(id) {
    _state.characters = _state.characters.filter(c => c.id !== id);
    _notify('characters');
  }

  function getCharacter(id) {
    return _state.characters.find(c => c.id === id) || null;
  }

  // ── Tokens ──────────────────────────────────────────────────────────────────

  function setTokens(tokens) {
    _state.tokens = Array.isArray(tokens) ? tokens : [];
    _notify('tokens');
  }

  function getToken(id) {
    return _state.tokens.find(t => t.id === id) || null;
  }

  // ── Combat ──────────────────────────────────────────────────────────────────

  function updateCombat(combatData) {
    if (!combatData) return;
    Object.assign(_state.combat, combatData);
    _notify('combat');
  }

  function resetCombat() {
    _state.combat = { active: false, turnOrder: [], currentTurnIndex: 0, round: 1 };
    _notify('combat');
  }

  // ── Dice History ─────────────────────────────────────────────────────────────

  function addDiceRoll(roll) {
    if (!roll) return;
    _state.diceHistory.unshift(roll);
    if (_state.diceHistory.length > 50) _state.diceHistory.pop();
    _notify('diceHistory');
  }

  function clearDiceHistory() {
    _state.diceHistory = [];
    _notify('diceHistory');
  }

  // ── Inventory ────────────────────────────────────────────────────────────────

  function setInventory(inventory) {
    _state.inventory = Array.isArray(inventory) ? inventory : [];
    _notify('inventory');
  }

  // ── Snapshot / Restore ───────────────────────────────────────────────────────

  function serialize() {
    return JSON.parse(JSON.stringify(_state));
  }

  function deserialize(data) {
    if (!data) return;
    if (data.map)         Object.assign(_state.map,     data.map);
    if (data.characters)  _state.characters  = data.characters;
    if (data.tokens)      _state.tokens      = data.tokens;
    if (data.combat)      Object.assign(_state.combat,  data.combat);
    if (data.diceHistory) _state.diceHistory = data.diceHistory;
    if (data.inventory)   _state.inventory   = data.inventory;
    _notify('all');
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return {
    get state()      { return _state; },
    onChange,
    // Map
    updateMap,
    // Characters
    setCharacters,
    addCharacter,
    removeCharacter,
    getCharacter,
    // Tokens
    setTokens,
    getToken,
    // Combat
    updateCombat,
    resetCombat,
    // Dice
    addDiceRoll,
    clearDiceHistory,
    // Inventory
    setInventory,
    // Snapshot
    serialize,
    deserialize,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameState;
}
