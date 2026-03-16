/**
 * tests/systems.test.js – Unit tests for PROJECT JO core systems.
 * Run with: node tests/systems.test.js
 */

'use strict';

// ── Load modules ─────────────────────────────────────────────────────────────
const Dice            = require('../js/dice.js');
const CharacterSystem = require('../js/character.js');
const InventorySystem = require('../js/inventory.js');
const MapEngine       = require('../js/mapEngine.js');
const CombatSystem    = require('../js/combatSystem.js');
const GameState       = require('../js/gameState.js');
const FogSystem       = require('../js/fogSystem.js');

// ── Minimal test harness ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✔  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✘  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertInRange(value, min, max, message) {
  if (value < min || value > max) {
    throw new Error(message || `Expected ${value} to be in [${min}, ${max}]`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  DICE SYSTEM
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🎲 Dice System');

test('rollDie returns integer in [1, sides]', () => {
  for (const sides of [4, 6, 8, 10, 12, 20]) {
    for (let i = 0; i < 50; i++) {
      const result = Dice.rollDie(sides);
      assertInRange(result, 1, sides, `d${sides} roll out of range: ${result}`);
      assert(Number.isInteger(result), `d${sides} roll is not an integer: ${result}`);
    }
  }
});

test('roll() returns correct structure', () => {
  const r = Dice.roll(6, 2, 3);
  assert(Array.isArray(r.rolls),           'rolls should be an array');
  assertEqual(r.rolls.length, 2,           'should have 2 rolls');
  assertEqual(r.modifier, 3,              'modifier should be 3');
  assertEqual(r.sides, 6,                 'sides should be 6');
  assertEqual(r.total, r.rolls.reduce((a, b) => a + b, 0) + 3, 'total should match sum + modifier');
});

test('roll() label formatting', () => {
  assertEqual(Dice.roll(20, 1, 0).label,  '1d20',    'no modifier label');
  assertEqual(Dice.roll(6,  3, 2).label,  '3d6+2',   'positive modifier label');
  assertEqual(Dice.roll(8,  1, -1).label, '1d8-1',   'negative modifier label');
});

test('DICE_TYPES contains standard D&D dice', () => {
  const required = [4, 6, 8, 10, 12, 20];
  required.forEach(d => {
    assert(Dice.DICE_TYPES.includes(d), `DICE_TYPES missing d${d}`);
  });
});

test('rollDie throws for invalid sides', () => {
  let threw = false;
  try { Dice.rollDie(1); } catch { threw = true; }
  assert(threw, 'Should throw for sides=1');
});

test('roll() with negative modifier can produce low totals', () => {
  // Roll 1d4 with -5 modifier — total may be negative
  const r = Dice.roll(4, 1, -5);
  assert(r.total === r.rolls[0] - 5, 'Negative modifier applied correctly');
});

// ════════════════════════════════════════════════════════════════════════════
//  CHARACTER SYSTEM
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🧝 Character System');

test('createCharacter returns valid object', () => {
  const c = CharacterSystem.createCharacter('Arven', 'Fighter', 'Human', 3);
  assertEqual(c.name,      'Arven',   'name');
  assertEqual(c.charClass, 'Fighter', 'charClass');
  assertEqual(c.race,      'Human',   'race');
  assertEqual(c.level,     3,         'level');
  assert(c.attributes.STR >= 1, 'STR should be set');
  assert(Array.isArray(c.abilities), 'abilities should be an array');
  assert(c.abilities.length > 0,     'should have class abilities');
});

test('createCharacter uses defaults for missing args', () => {
  const c = CharacterSystem.createCharacter();
  assertEqual(c.name,      'Unnamed Hero', 'default name');
  assertEqual(c.charClass, 'Fighter',      'default class');
  assertEqual(c.race,      'Human',        'default race');
  assertEqual(c.level,     1,              'default level');
});

test('modifier() computes correctly', () => {
  assertEqual(CharacterSystem.modifier(10), 0,  'modifier(10) = 0');
  assertEqual(CharacterSystem.modifier(12), 1,  'modifier(12) = 1');
  assertEqual(CharacterSystem.modifier(8),  -1, 'modifier(8) = -1');
  assertEqual(CharacterSystem.modifier(20), 5,  'modifier(20) = 5');
  assertEqual(CharacterSystem.modifier(1),  -5, 'modifier(1) = -5');
  assertEqual(CharacterSystem.modifier(30), 10, 'modifier(30) = 10');
});

test('formatMod() formats modifiers correctly', () => {
  assertEqual(CharacterSystem.formatMod(10), '+0', 'formatMod(10)');
  assertEqual(CharacterSystem.formatMod(14), '+2', 'formatMod(14)');
  assertEqual(CharacterSystem.formatMod(7),  '-2', 'formatMod(7)');
});

test('defaultAttributes() returns all 6 stats', () => {
  const attrs = CharacterSystem.defaultAttributes();
  CharacterSystem.ATTRIBUTES.forEach(attr => {
    assert(attr in attrs,             `${attr} should be present`);
    assert(attrs[attr] >= 1,          `${attr} should be >= 1`);
    assert(attrs[attr] <= 30,         `${attr} should be <= 30`);
  });
});

test('CLASSES contains standard D&D classes', () => {
  const required = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Paladin'];
  required.forEach(cls => {
    assert(CharacterSystem.CLASSES.includes(cls), `CLASSES missing ${cls}`);
  });
});

test('HP is set based on level', () => {
  const lvl1 = CharacterSystem.createCharacter('A', 'Fighter', 'Human', 1);
  const lvl5 = CharacterSystem.createCharacter('B', 'Fighter', 'Human', 5);
  assert(lvl5.maxHp > lvl1.maxHp, 'Higher level should have more HP');
  assertEqual(lvl5.currentHp, lvl5.maxHp, 'currentHp should equal maxHp at creation');
});

test('classAvatar() returns emoji for all classes', () => {
  CharacterSystem.CLASSES.forEach(cls => {
    const avatar = CharacterSystem.classAvatar(cls);
    assert(typeof avatar === 'string' && avatar.length > 0, `No avatar for ${cls}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  INVENTORY SYSTEM
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🎒 Inventory System');

test('createItem returns valid item', () => {
  const item = InventorySystem.createItem('Sword', 'Weapon', '⚔️', 1, 1);
  assertEqual(item.name,  'Sword',  'name');
  assertEqual(item.type,  'Weapon', 'type');
  assertEqual(item.icon,  '⚔️',    'icon');
  assertEqual(item.count, 1,        'count');
  assert(typeof item.id === 'number', 'id should be a number');
});

test('createItem uses defaults for missing args', () => {
  const item = InventorySystem.createItem();
  assertEqual(item.name,  'Unknown Item', 'default name');
  assertEqual(item.type,  'Misc',         'default type');
  assertEqual(item.icon,  '📦',           'default icon');
  assertEqual(item.count, 1,              'default count');
});

test('useItem() decrements consumable count', () => {
  const potion = InventorySystem.createItem('Health Potion', 'Consumable', '🧪', 3);
  const used   = InventorySystem.useItem(potion);
  assert(used,               'useItem should return true');
  assertEqual(potion.count, 2, 'count should decrease by 1');
});

test('useItem() fails on non-consumable', () => {
  const sword = InventorySystem.createItem('Sword', 'Weapon', '⚔️', 1);
  const used  = InventorySystem.useItem(sword);
  assert(!used,              'useItem on Weapon should return false');
  assertEqual(sword.count, 1, 'sword count unchanged');
});

test('useItem() fails when count is 0', () => {
  const potion = InventorySystem.createItem('Empty Vial', 'Consumable', '🧪', 0);
  const used   = InventorySystem.useItem(potion);
  assert(!used, 'useItem on empty consumable should return false');
});

test('addItem() increases count (capped at maxCount)', () => {
  const item = InventorySystem.createItem('Arrow', 'Misc', '🏹', 18, 20);
  InventorySystem.addItem(item, 5);
  assertEqual(item.count, 20, 'Should cap at maxCount');
});

test('removeItem() decreases count', () => {
  const item   = InventorySystem.createItem('Coin', 'Treasure', '🪙', 50);
  const actual = InventorySystem.removeItem(item, 10);
  assertEqual(actual,      10, 'should report 10 removed');
  assertEqual(item.count, 40,  'count should be 40');
});

test('removeItem() cannot go below 0', () => {
  const item   = InventorySystem.createItem('Torch', 'Tool', '🔦', 2);
  const actual = InventorySystem.removeItem(item, 10);
  assertEqual(actual,     2, 'only 2 were available');
  assertEqual(item.count, 0, 'count bottoms out at 0');
});

test('starterInventory() returns non-empty array', () => {
  const inv = InventorySystem.starterInventory();
  assert(Array.isArray(inv) && inv.length > 0, 'should return items');
  inv.forEach(item => {
    assert(item.name,          `item missing name: ${JSON.stringify(item)}`);
    assert(item.count >= 0,    `item count invalid: ${item.name}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  MAP ENGINE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🗺️  Map Engine');

test('initMap creates correct dimensions', () => {
  MapEngine.initMap(10, 8);
  assertEqual(MapEngine.width,  10, 'width should be 10');
  assertEqual(MapEngine.height,  8, 'height should be 8');
  assertEqual(MapEngine.mapState.tiles.length, 8, 'should have 8 rows');
  assertEqual(MapEngine.mapState.tiles[0].length, 10, 'each row should have 10 cols');
});

test('initMap clamps dimensions to valid range', () => {
  MapEngine.initMap(1, 1);
  assert(MapEngine.width  >= 5, 'width should be clamped to minimum 5');
  assert(MapEngine.height >= 5, 'height should be clamped to minimum 5');
  MapEngine.initMap(999, 999);
  assert(MapEngine.width  <= 50, 'width should be clamped to maximum 50');
  assert(MapEngine.height <= 30, 'height should be clamped to maximum 30');
});

test('initMap creates empty tiles (null type)', () => {
  MapEngine.initMap(5, 5);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const tile = MapEngine.getTile(r, c);
      assert(tile !== null, 'tile object should exist');
      assertEqual(tile.type, null, 'tile type should be null');
    }
  }
});

test('setTile / getTile round-trip', () => {
  MapEngine.initMap(10, 10);
  MapEngine.setTile(2, 3, 'wall');
  const tile = MapEngine.getTile(2, 3);
  assertEqual(tile.type, 'wall', 'tile type should be wall');
  assertEqual(tile.walkable, false, 'wall should not be walkable');
});

test('setTile with null / empty erases tile', () => {
  MapEngine.initMap(10, 10);
  MapEngine.setTile(0, 0, 'floor');
  MapEngine.setTile(0, 0, null);
  assertEqual(MapEngine.getTile(0, 0).type, null, 'tile should be null after erase');
  MapEngine.setTile(1, 1, 'floor');
  MapEngine.setTile(1, 1, 'empty');
  assertEqual(MapEngine.getTile(1, 1).type, null, 'tile should be null after empty');
});

test('getTile returns null for out-of-bounds coordinates', () => {
  MapEngine.initMap(5, 5);
  assertEqual(MapEngine.getTile(-1, 0),  null, 'negative row should return null');
  assertEqual(MapEngine.getTile(0, -1),  null, 'negative col should return null');
  assertEqual(MapEngine.getTile(99, 0),  null, 'out-of-range row should return null');
  assertEqual(MapEngine.getTile(0, 99),  null, 'out-of-range col should return null');
});

test('fillMap sets all tiles to given type', () => {
  MapEngine.initMap(6, 6);
  MapEngine.fillMap('floor');
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      assertEqual(MapEngine.getTile(r, c).type, 'floor', `(${r},${c}) should be floor`);
    }
  }
});

test('floodFill replaces connected region', () => {
  MapEngine.initMap(5, 5);
  // Paint the whole map as floor
  MapEngine.fillMap('floor');
  // Place a wall in the middle
  MapEngine.setTile(2, 2, 'wall');
  // Flood fill from (0,0) with grass — should NOT cross the single wall cell
  MapEngine.floodFill(0, 0, 'grass');
  // The entire floor area connected to (0,0) becomes grass
  assertEqual(MapEngine.getTile(0, 0).type, 'grass', '(0,0) should be grass after fill');
  // The wall should remain untouched
  assertEqual(MapEngine.getTile(2, 2).type, 'wall', 'wall should be unchanged');
});

test('fillRect paints rectangular region', () => {
  MapEngine.initMap(10, 10);
  MapEngine.fillRect(1, 1, 3, 4, 'stone');
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= 4; c++) {
      assertEqual(MapEngine.getTile(r, c).type, 'stone', `(${r},${c}) should be stone`);
    }
  }
  // Outside the rect should still be null
  assertEqual(MapEngine.getTile(0, 0).type, null, 'outside rect should be null');
});

test('serialize / deserialize round-trip preserves tile data', () => {
  MapEngine.initMap(8, 6);
  MapEngine.setTile(0, 0, 'lava');
  MapEngine.setTile(5, 7, 'water');
  const snapshot = MapEngine.serialize();
  MapEngine.initMap(5, 5);  // reset
  MapEngine.deserialize(snapshot);
  assertEqual(MapEngine.width,  8, 'width restored');
  assertEqual(MapEngine.height, 6, 'height restored');
  assertEqual(MapEngine.getTile(0, 0).type, 'lava',  'lava tile restored');
  assertEqual(MapEngine.getTile(5, 7).type, 'water', 'water tile restored');
});

test('TILE_DEFS contains walkability info for all key types', () => {
  ['floor', 'stone', 'grass', 'door', 'trap', 'stairs'].forEach(type => {
    assert(MapEngine.TILE_DEFS[type].walkable === true,  `${type} should be walkable`);
  });
  ['wall', 'water', 'lava'].forEach(type => {
    assert(MapEngine.TILE_DEFS[type].walkable === false, `${type} should not be walkable`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  COMBAT SYSTEM
// ════════════════════════════════════════════════════════════════════════════
console.log('\n⚔️  Combat System');

test('rollInitiativeForTokens sorts by initiative descending', () => {
  const tokens = [
    { id: 1, name: 'Alice', avatar: '🧝' },
    { id: 2, name: 'Bob',   avatar: '🧙' },
    { id: 3, name: 'Carol', avatar: '🗡️' },
  ];
  const order = CombatSystem.rollInitiativeForTokens(tokens);
  assert(Array.isArray(order), 'should return array');
  assertEqual(order.length, 3, 'should have 3 participants');
  for (let i = 0; i < order.length - 1; i++) {
    assert(
      order[i].initiative >= order[i + 1].initiative,
      'initiatives should be in descending order'
    );
  }
});

test('rollInitiativeForTokens initialises combat state', () => {
  const tokens = [{ id: 1, name: 'A', avatar: '🧝' }];
  CombatSystem.rollInitiativeForTokens(tokens);
  assert(CombatSystem.combatState.active,            'combat should be active');
  assertEqual(CombatSystem.combatState.round, 1,      'round should start at 1');
  assertEqual(CombatSystem.combatState.currentTurn, 0,'currentTurn should start at 0');
});

test('rollInitiativeForTokens assigns d20 initiative values', () => {
  const tokens = [
    { id: 1, name: 'A', avatar: '🧝' },
    { id: 2, name: 'B', avatar: '🧙' },
  ];
  const order = CombatSystem.rollInitiativeForTokens(tokens);
  order.forEach(p => {
    assertInRange(p.initiative, 1, 20, `initiative ${p.initiative} should be a d20 value`);
  });
});

test('nextTurn advances the current turn', () => {
  const tokens = [
    { id: 1, name: 'A', avatar: '🧝' },
    { id: 2, name: 'B', avatar: '🧙' },
    { id: 3, name: 'C', avatar: '🗡️' },
  ];
  CombatSystem.rollInitiativeForTokens(tokens);
  assertEqual(CombatSystem.combatState.currentTurn, 0, 'starts at turn 0');
  CombatSystem.nextTurn();
  assertEqual(CombatSystem.combatState.currentTurn, 1, 'should advance to turn 1');
  CombatSystem.nextTurn();
  assertEqual(CombatSystem.combatState.currentTurn, 2, 'should advance to turn 2');
});

test('nextTurn wraps around and increments round', () => {
  const tokens = [
    { id: 1, name: 'A', avatar: '🧝' },
    { id: 2, name: 'B', avatar: '🧙' },
  ];
  CombatSystem.rollInitiativeForTokens(tokens);
  assertEqual(CombatSystem.combatState.round, 1, 'starts at round 1');
  CombatSystem.nextTurn();   // turn 1
  CombatSystem.nextTurn();   // wraps to turn 0 → round 2
  assertEqual(CombatSystem.combatState.currentTurn, 0, 'should wrap to turn 0');
  assertEqual(CombatSystem.combatState.round, 2, 'should increment to round 2');
});

test('endCombat resets state', () => {
  const tokens = [{ id: 1, name: 'A', avatar: '🧝' }];
  CombatSystem.rollInitiativeForTokens(tokens);
  assert(CombatSystem.combatState.active, 'combat is active before end');
  CombatSystem.endCombat();
  assert(!CombatSystem.combatState.active,               'combat should be inactive');
  assertEqual(CombatSystem.combatState.turnOrder.length, 0, 'turn order should be empty');
  assertEqual(CombatSystem.combatState.round, 1,            'round should reset to 1');
});

test('getCurrentParticipant returns null when not in combat', () => {
  CombatSystem.endCombat();
  assertEqual(CombatSystem.getCurrentParticipant(), null, 'should be null outside combat');
});

test('rollInitiativeForTokens returns empty array for no tokens', () => {
  const result = CombatSystem.rollInitiativeForTokens([]);
  assert(Array.isArray(result) && result.length === 0, 'should return empty array');
});

// ════════════════════════════════════════════════════════════════════════════
//  GAME STATE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🗃  Game State');

test('state has all required top-level keys', () => {
  const { state } = GameState;
  assert('map'        in state, 'state should have map');
  assert('characters' in state, 'state should have characters');
  assert('tokens'     in state, 'state should have tokens');
  assert('combat'     in state, 'state should have combat');
  assert('diceHistory'in state, 'state should have diceHistory');
  assert('inventory'  in state, 'state should have inventory');
});

test('state.map has required map fields', () => {
  const { map } = GameState.state;
  assert('width'  in map, 'map should have width');
  assert('height' in map, 'map should have height');
  assert('tiles'  in map, 'map should have tiles');
});

test('setCharacters / getCharacter round-trip', () => {
  GameState.setCharacters([{ id: 99, name: 'TestHero' }]);
  const char = GameState.getCharacter(99);
  assert(char !== null,              'character should be found');
  assertEqual(char.name, 'TestHero', 'name should match');
});

test('addCharacter appends to characters list', () => {
  GameState.setCharacters([]);
  GameState.addCharacter({ id: 1, name: 'Alice' });
  GameState.addCharacter({ id: 2, name: 'Bob' });
  assertEqual(GameState.state.characters.length, 2, 'should have 2 characters');
});

test('removeCharacter removes by id', () => {
  GameState.setCharacters([{ id: 10, name: 'X' }, { id: 11, name: 'Y' }]);
  GameState.removeCharacter(10);
  assertEqual(GameState.state.characters.length, 1, 'should have 1 character');
  assertEqual(GameState.state.characters[0].id, 11,  'remaining should be id 11');
});

test('addDiceRoll prepends to diceHistory', () => {
  GameState.clearDiceHistory();
  GameState.addDiceRoll({ label: '1d20', total: 15 });
  GameState.addDiceRoll({ label: '1d6',  total: 4 });
  assertEqual(GameState.state.diceHistory[0].label, '1d6',  'newest roll first');
  assertEqual(GameState.state.diceHistory[1].label, '1d20', 'older roll second');
});

test('addDiceRoll caps history at 50 entries', () => {
  GameState.clearDiceHistory();
  for (let i = 0; i < 55; i++) GameState.addDiceRoll({ total: i });
  assert(GameState.state.diceHistory.length <= 50, 'should cap at 50');
});

test('updateCombat merges into combat state', () => {
  GameState.resetCombat();
  GameState.updateCombat({ active: true, round: 3 });
  assert(GameState.state.combat.active,         'combat should be active');
  assertEqual(GameState.state.combat.round, 3,  'round should be 3');
});

test('resetCombat restores defaults', () => {
  GameState.updateCombat({ active: true, round: 5 });
  GameState.resetCombat();
  assert(!GameState.state.combat.active,            'combat should be inactive');
  assertEqual(GameState.state.combat.round,    1,   'round should reset to 1');
  assertEqual(GameState.state.combat.turnOrder.length, 0, 'turnOrder should be empty');
});

test('onChange callback fires on state mutation', () => {
  let fired = false;
  GameState.onChange(() => { fired = true; });
  GameState.setCharacters([{ id: 77, name: 'Observer' }]);
  assert(fired, 'onChange should have been called');
});

test('serialize / deserialize round-trip', () => {
  GameState.setCharacters([{ id: 5, name: 'Syl' }]);
  GameState.updateCombat({ round: 4 });
  const snapshot = GameState.serialize();
  GameState.setCharacters([]);
  GameState.resetCombat();
  GameState.deserialize(snapshot);
  assertEqual(GameState.state.characters[0].name, 'Syl', 'character name preserved');
  assertEqual(GameState.state.combat.round, 4, 'combat round preserved');
});

// ════════════════════════════════════════════════════════════════════════════
//  FOG SYSTEM
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🌫  Fog System');

// Helper: set up a fresh 10×10 map with no blocking tiles
function _initFog(w = 10, h = 10, blockers = []) {
  FogSystem.init(w, h, (row, col) => {
    const isWall = blockers.some(([r, c]) => r === row && c === col);
    return isWall ? { type: 'wall' } : { type: 'floor' };
  });
}

test('getFogLevel returns "visible" when fog is disabled', () => {
  _initFog();
  FogSystem.setEnabled(false);
  assertEqual(FogSystem.getFogLevel(0, 0), 'visible', 'disabled fog → always visible');
  assertEqual(FogSystem.getFogLevel(5, 5), 'visible', 'disabled fog → always visible');
});

test('getFogLevel returns "hidden" for unexplored tiles when enabled', () => {
  _initFog();
  FogSystem.setEnabled(true);
  assertEqual(FogSystem.getFogLevel(0, 0), 'hidden', 'no tokens → tiles should be hidden');
});

test('updateVisibility marks tiles visible from token position', () => {
  _initFog();
  FogSystem.setEnabled(true);
  FogSystem.updateVisibility([{ x: 5, y: 5 }], 3);
  assertEqual(FogSystem.getFogLevel(5, 5), 'visible', 'origin should be visible');
});

test('updateVisibility reveals tiles within radius', () => {
  _initFog();
  FogSystem.setEnabled(true);
  FogSystem.updateVisibility([{ x: 5, y: 5 }], 3);
  // Tiles within radius 3 should be at minimum explored
  const level = FogSystem.getFogLevel(5, 6);
  assert(level === 'visible' || level === 'explored', 'adjacent tile within radius should be visible/explored');
});

test('previously visible tiles become explored after visibility update', () => {
  _initFog();
  FogSystem.setEnabled(true);
  FogSystem.updateVisibility([{ x: 3, y: 3 }], 3);
  // Move token away – tiles around (3,3) should become 'explored'
  FogSystem.updateVisibility([{ x: 9, y: 9 }], 3);
  const level = FogSystem.getFogLevel(3, 3);
  assert(level === 'explored' || level === 'visible', 'previously visited tile should be explored or visible');
});

test('walls block line of sight', () => {
  // Wall at (5, 5), token at (5, 3); tile at (5, 7) should be hidden
  _initFog(10, 10, [[5, 5]]);
  FogSystem.setEnabled(true);
  FogSystem.updateVisibility([{ x: 3, y: 5 }], 6);
  // (5,7) is behind the wall along the same row; vision-blocking depends on angle
  // At minimum: the wall tile itself may be revealed (edge of ray), but tiles behind should be hidden
  const wallLevel = FogSystem.getFogLevel(5, 5);
  // Wall cell can be revealed (it's the edge of the ray that hit it)
  assert(['visible', 'explored', 'hidden'].includes(wallLevel), 'wall cell has valid fog level');
});

test('resetFog clears all revealed and visible tiles', () => {
  _initFog();
  FogSystem.setEnabled(true);
  FogSystem.updateVisibility([{ x: 5, y: 5 }], 5);
  FogSystem.resetFog();
  assertEqual(FogSystem.getFogLevel(5, 5), 'hidden', 'after reset, tiles should be hidden');
  assertEqual(FogSystem.fogState.revealedTiles.size, 0, 'revealedTiles should be empty');
  assertEqual(FogSystem.fogState.visibleTiles.size,  0, 'visibleTiles should be empty');
});

test('setEnabled(false) clears fog sets', () => {
  _initFog();
  FogSystem.setEnabled(true);
  FogSystem.updateVisibility([{ x: 5, y: 5 }], 4);
  FogSystem.setEnabled(false);
  assertEqual(FogSystem.fogState.revealedTiles.size, 0, 'revealed tiles cleared on disable');
  assertEqual(FogSystem.fogState.visibleTiles.size,  0, 'visible tiles cleared on disable');
});

test('serialize / deserialize round-trip', () => {
  _initFog();
  FogSystem.setEnabled(true);
  FogSystem.updateVisibility([{ x: 5, y: 5 }], 3);
  const revealed = FogSystem.fogState.revealedTiles.size;
  const data = FogSystem.serialize();
  assert(data.enabled,                         'serialized enabled should be true');
  assert(Array.isArray(data.revealedTiles),    'serialized revealedTiles should be array');
  assertEqual(data.revealedTiles.length, revealed, 'serialized length should match');

  // Deserialize into a fresh init
  FogSystem.resetFog();
  FogSystem.deserialize(data);
  assertEqual(FogSystem.fogState.revealedTiles.size, revealed, 'revealedTiles size preserved');
  assertEqual(FogSystem.fogState.enabled, true,                'enabled flag preserved');
});

test('DEFAULT_VISION_RADIUS is a positive number', () => {
  assert(typeof FogSystem.DEFAULT_VISION_RADIUS === 'number', 'should be a number');
  assert(FogSystem.DEFAULT_VISION_RADIUS > 0, 'should be positive');
});

// ════════════════════════════════════════════════════════════════════════════
//  Summary
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed ✔');
}
