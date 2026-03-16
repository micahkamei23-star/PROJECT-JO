/**
 * tests/systems.test.js – Unit tests for PROJECT JO core systems.
 * Run with: node tests/systems.test.js
 */

'use strict';

// ── Load modules ─────────────────────────────────────────────────────────────
const Dice            = require('../js/dice.js');
const CharacterSystem = require('../js/character.js');
const InventorySystem = require('../js/inventory.js');

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
//  Summary
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed ✔');
}
