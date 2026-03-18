/**
 * tests/gamestate.test.js – Unit tests for GameState module.
 * Run with: node tests/gamestate.test.js
 */

'use strict';

const EventBus  = require('../js/engine/eventBus.js');
const GameState = require('../js/engine/GameState.js');

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

// ════════════════════════════════════════════════════════════════════════════
//  GAMESTATE — Core Module
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🏛️  GameState — Core');

test('reset clears all state', () => {
  GameState.reset();
  const s = GameState.getState();
  assertEqual(s.map.width, 0, 'map width should be 0');
  assertEqual(s.map.height, 0, 'map height should be 0');
  assertEqual(Object.keys(s.tokens).length, 0, 'tokens should be empty');
  assertEqual(s.combat.active, false, 'combat should be inactive');
  assertEqual(s.selection.selectedTokenId, null, 'selection should be null');
});

test('getState returns a safe copy (not internal reference)', () => {
  GameState.reset();
  const s1 = GameState.getState();
  const s2 = GameState.getState();
  assert(s1 !== s2, 'getState() should return distinct objects');
  assert(s1.tokens !== s2.tokens, 'tokens should be distinct objects');
  assert(s1.combat !== s2.combat, 'combat should be distinct objects');
});

// ════════════════════════════════════════════════════════════════════════════
//  MAP STATE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🗺️  GameState — Map');

test('map.init creates tiles with correct dimensions', () => {
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 10, height: 8 } });
  const dims = GameState.getMapDimensions();
  assertEqual(dims.width, 10, 'width should be 10');
  assertEqual(dims.height, 8, 'height should be 8');
  const tile = GameState.getMapTile(0, 0);
  assert(tile !== null, 'tile at (0,0) should exist');
  assertEqual(tile.type, null, 'default tile type should be null');
});

test('map.init clamps dimensions to valid range', () => {
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 100, height: 100 } });
  const dims = GameState.getMapDimensions();
  assertEqual(dims.width, 50, 'width should be clamped to 50');
  assertEqual(dims.height, 30, 'height should be clamped to 30');
});

test('map.setTile sets and reads correctly', () => {
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 10, height: 10 } });
  GameState.applyAction({ type: 'map.setTile', payload: { row: 2, col: 3, type: 'wall' } });
  const tile = GameState.getMapTile(2, 3);
  assertEqual(tile.type, 'wall', 'tile should be wall');
  assertEqual(tile.walkable, false, 'wall should not be walkable');
});

test('map.setTile no-op when value unchanged', () => {
  EventBus.clear();
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 10, height: 10 } });

  // First set
  GameState.applyAction({ type: 'map.setTile', payload: { row: 0, col: 0, type: 'floor' } });

  // Count events on second identical set
  let eventCount = 0;
  const handler = () => { eventCount++; };
  EventBus.on('state.map.updated', handler);
  GameState.applyAction({ type: 'map.setTile', payload: { row: 0, col: 0, type: 'floor' } });
  EventBus.off('state.map.updated', handler);
  // Due to per-tick dedup, event should not fire again
  assertEqual(eventCount, 0, 'no event should fire for no-op tile set');
});

test('map.setTile validates bounds', () => {
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 10, height: 10 } });
  GameState.applyAction({ type: 'map.setTile', payload: { row: -1, col: 0, type: 'wall' } });
  GameState.applyAction({ type: 'map.setTile', payload: { row: 0, col: 100, type: 'wall' } });
  // Should not crash — invalid ops are silently ignored
  assertEqual(GameState.getMapTile(-1, 0), null, 'out of bounds returns null');
});

test('getMapTile returns safe copy', () => {
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 10, height: 10 } });
  GameState.applyAction({ type: 'map.setTile', payload: { row: 0, col: 0, type: 'floor' } });
  const t1 = GameState.getMapTile(0, 0);
  const t2 = GameState.getMapTile(0, 0);
  assert(t1 !== t2, 'returned tiles should be distinct objects');
});

// ════════════════════════════════════════════════════════════════════════════
//  TOKEN STATE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🎭 GameState — Tokens');

test('token.add creates token and token.remove deletes it', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: {
    id: 1, characterId: 100, x: 5, y: 3, hp: 20, maxHp: 20,
    name: 'Wizard', avatar: '🧙',
  }});
  const token = GameState.getToken(1);
  assert(token !== null, 'token should exist');
  assertEqual(token.name, 'Wizard', 'name should be Wizard');
  assertEqual(token.x, 5, 'x should be 5');
  assertEqual(token.y, 3, 'y should be 3');
  assertEqual(token.hp, 20, 'hp should be 20');
  assertEqual(token.faction, 'ally', 'default faction should be ally');
  assertEqual(token.visionRadius, 6, 'default visionRadius should be 6');

  GameState.applyAction({ type: 'token.remove', payload: { id: 1 } });
  assertEqual(GameState.getToken(1), null, 'token should be removed');
});

test('token.setPosition updates coordinates', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 10, x: 0, y: 0, hp: 10, maxHp: 10 } });
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 10, x: 5, y: 7 } });
  const token = GameState.getToken(10);
  assertEqual(token.x, 5, 'x should be 5');
  assertEqual(token.y, 7, 'y should be 7');
});

test('token.setPosition no-op when values unchanged', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 20, x: 3, y: 4, hp: 10, maxHp: 10 } });
  const histBefore = GameState.getHistory().length;
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 20, x: 3, y: 4 } });
  const histAfter = GameState.getHistory().length;
  assertEqual(histBefore, histAfter, 'no history entry for no-op');
});

test('token.setHP clamps to [0, maxHp]', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 30, hp: 10, maxHp: 20 } });
  GameState.applyAction({ type: 'token.setHP', payload: { id: 30, hp: 25 } });
  assertEqual(GameState.getToken(30).hp, 20, 'hp should be clamped to maxHp');
  GameState.applyAction({ type: 'token.setHP', payload: { id: 30, hp: -5 } });
  assertEqual(GameState.getToken(30).hp, 0, 'hp should be clamped to 0');
});

test('token.update updates multiple fields with change detection', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: {
    id: 40, x: 0, y: 0, hp: 10, maxHp: 10, faction: 'ally',
  }});
  GameState.applyAction({ type: 'token.update', payload: {
    id: 40, faction: 'enemy', name: 'Goblin',
  }});
  const t = GameState.getToken(40);
  assertEqual(t.faction, 'enemy', 'faction should be updated');
  assertEqual(t.name, 'Goblin', 'name should be updated');
});

test('getToken returns null for non-existent token', () => {
  GameState.reset();
  assertEqual(GameState.getToken(999), null, 'should return null');
});

test('getTokensArray returns array of all tokens', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 1, hp: 10, maxHp: 10 } });
  GameState.applyAction({ type: 'token.add', payload: { id: 2, hp: 20, maxHp: 20 } });
  const arr = GameState.getTokensArray();
  assertEqual(arr.length, 2, 'should have 2 tokens');
});

test('token.remove clears selection if removed token was selected', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 50, hp: 10, maxHp: 10 } });
  GameState.applyAction({ type: 'selection.set', payload: { tokenId: 50 } });
  assertEqual(GameState.getSelection().selectedTokenId, 50, 'should be selected');
  GameState.applyAction({ type: 'token.remove', payload: { id: 50 } });
  assertEqual(GameState.getSelection().selectedTokenId, null, 'selection should be cleared');
});

// ════════════════════════════════════════════════════════════════════════════
//  SELECTION STATE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n👆 GameState — Selection');

test('selection.set updates selectedTokenId', () => {
  GameState.reset();
  GameState.applyAction({ type: 'selection.set', payload: { tokenId: 42 } });
  assertEqual(GameState.getSelection().selectedTokenId, 42, 'should be 42');
  GameState.applyAction({ type: 'selection.set', payload: { tokenId: null } });
  assertEqual(GameState.getSelection().selectedTokenId, null, 'should be null');
});

test('selection.set no-op when value unchanged', () => {
  GameState.reset();
  GameState.applyAction({ type: 'selection.set', payload: { tokenId: 5 } });
  const histBefore = GameState.getHistory().length;
  GameState.applyAction({ type: 'selection.set', payload: { tokenId: 5 } });
  assertEqual(GameState.getHistory().length, histBefore, 'no history for no-op');
});

// ════════════════════════════════════════════════════════════════════════════
//  COMBAT STATE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n⚔️  GameState — Combat');

test('combat.setState sets and reads combat data', () => {
  GameState.reset();
  GameState.applyAction({ type: 'combat.setState', payload: {
    active: true, round: 1,
    turnOrder: [{ id: 1, name: 'A', initiative: 15 }, { id: 2, name: 'B', initiative: 10 }],
    currentTurnIndex: 0,
  }});
  const c = GameState.getCombat();
  assertEqual(c.active, true, 'should be active');
  assertEqual(c.turnOrder.length, 2, 'should have 2 participants');
  assertEqual(c.currentTurnIndex, 0, 'turn index should be 0');
});

test('combat.setBudget and combat.useAction work correctly', () => {
  GameState.reset();
  GameState.applyAction({ type: 'combat.setBudget', payload: {
    tokenId: 1, budget: { actions: 1, bonus: 1, reaction: 1, movement: 30 },
  }});
  const c = GameState.getCombat();
  assertEqual(c.actionBudgets[1].actions, 1, 'should have 1 action');
  GameState.applyAction({ type: 'combat.useAction', payload: {
    tokenId: 1, cost: 'actions', amount: 1,
  }});
  const c2 = GameState.getCombat();
  assertEqual(c2.actionBudgets[1].actions, 0, 'should have 0 actions');
});

test('combat conditions add/remove', () => {
  GameState.reset();
  GameState.applyAction({ type: 'combat.addCondition', payload: { tokenId: 1, condition: 'poisoned' } });
  GameState.applyAction({ type: 'combat.addCondition', payload: { tokenId: 1, condition: 'blinded' } });
  const c = GameState.getCombat();
  assert(c.conditions[1].includes('poisoned'), 'should have poisoned');
  assert(c.conditions[1].includes('blinded'), 'should have blinded');
  GameState.applyAction({ type: 'combat.removeCondition', payload: { tokenId: 1, condition: 'poisoned' } });
  const c2 = GameState.getCombat();
  assert(!c2.conditions[1].includes('poisoned'), 'poisoned should be removed');
  assert(c2.conditions[1].includes('blinded'), 'blinded should remain');
});

// ════════════════════════════════════════════════════════════════════════════
//  TRANSACTION SYSTEM
// ════════════════════════════════════════════════════════════════════════════
console.log('\n📦 GameState — Transactions');

test('transactions batch events', () => {
  EventBus.clear();
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 10, height: 10 } });

  let eventCount = 0;
  EventBus.on('state.map.updated', () => { eventCount++; });

  GameState.beginTransaction();
  GameState.applyAction({ type: 'map.setTile', payload: { row: 0, col: 0, type: 'wall' } });
  GameState.applyAction({ type: 'map.setTile', payload: { row: 1, col: 1, type: 'floor' } });
  assertEqual(eventCount, 0, 'no events during transaction');
  GameState.endTransaction();

  // After end, consolidated events should fire
  assert(eventCount > 0, 'events should fire after endTransaction');
  EventBus.clear();
});

test('transactions deduplicate same-entity events', () => {
  EventBus.clear();
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 1, hp: 10, maxHp: 10, x: 0, y: 0 } });

  let updateCount = 0;
  EventBus.on('state.token.updated', () => { updateCount++; });

  GameState.beginTransaction();
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 1, x: 1, y: 0 } });
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 1, x: 2, y: 0 } });
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 1, x: 3, y: 0 } });
  GameState.endTransaction();

  assertEqual(updateCount, 1, 'should emit only 1 consolidated event');
  const t = GameState.getToken(1);
  assertEqual(t.x, 3, 'token should be at final position');
  EventBus.clear();
});

// ════════════════════════════════════════════════════════════════════════════
//  HISTORY / UNDO / REDO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n📜 GameState — History');

test('undo reverses token.setPosition', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 1, x: 0, y: 0, hp: 10, maxHp: 10 } });
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 1, x: 5, y: 5 } });
  assertEqual(GameState.getToken(1).x, 5, 'token should be at 5');
  assert(GameState.canUndo(), 'should be able to undo');
  GameState.undo();
  assertEqual(GameState.getToken(1).x, 0, 'token should be back at 0');
});

test('redo re-applies undone action', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 2, x: 0, y: 0, hp: 10, maxHp: 10 } });
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 2, x: 10, y: 10 } });
  GameState.undo();
  assertEqual(GameState.getToken(2).x, 0, 'should be 0 after undo');
  assert(GameState.canRedo(), 'should be able to redo');
  GameState.redo();
  assertEqual(GameState.getToken(2).x, 10, 'should be 10 after redo');
});

test('undo reverses token.setHP', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 3, hp: 20, maxHp: 20 } });
  GameState.applyAction({ type: 'token.setHP', payload: { id: 3, hp: 5 } });
  assertEqual(GameState.getToken(3).hp, 5, 'hp should be 5');
  GameState.undo();
  assertEqual(GameState.getToken(3).hp, 20, 'hp should be restored to 20');
});

test('undo reverses selection.set', () => {
  GameState.reset();
  GameState.applyAction({ type: 'selection.set', payload: { tokenId: 1 } });
  GameState.applyAction({ type: 'selection.set', payload: { tokenId: 2 } });
  GameState.undo();
  assertEqual(GameState.getSelection().selectedTokenId, 1, 'should restore to 1');
});

test('history has max size limit', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 99, x: 0, y: 0, hp: 10, maxHp: 10 } });
  for (let i = 0; i < 60; i++) {
    GameState.applyAction({ type: 'token.setPosition', payload: { id: 99, x: i + 1, y: 0 } });
  }
  const hist = GameState.getHistory();
  assert(hist.length <= 50, `history should be ≤ 50, got ${hist.length}`);
});

test('undo reverses map.setTile', () => {
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 10, height: 10 } });
  GameState.applyAction({ type: 'map.setTile', payload: { row: 0, col: 0, type: 'floor' } });
  assertEqual(GameState.getMapTile(0, 0).type, 'floor', 'should be floor');
  GameState.undo();
  assertEqual(GameState.getMapTile(0, 0).type, null, 'should be null after undo');
});

test('canUndo and canRedo return correct state', () => {
  GameState.reset();
  assert(!GameState.canUndo(), 'should not be able to undo initially');
  assert(!GameState.canRedo(), 'should not be able to redo initially');
  GameState.applyAction({ type: 'token.add', payload: { id: 1, hp: 10, maxHp: 10 } });
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 1, x: 5, y: 5 } });
  assert(GameState.canUndo(), 'should be able to undo');
  GameState.undo();
  assert(GameState.canRedo(), 'should be able to redo after undo');
});

// ════════════════════════════════════════════════════════════════════════════
//  EVENT EMISSION
// ════════════════════════════════════════════════════════════════════════════
console.log('\n📡 GameState — Events');

test('token.add emits state.token.updated', () => {
  EventBus.clear();
  GameState.reset();
  let received = null;
  EventBus.on('state.token.updated', (data) => { received = data; });
  GameState.applyAction({ type: 'token.add', payload: { id: 1, hp: 10, maxHp: 10 } });
  assert(received !== null, 'should receive event');
  assertEqual(received.id, 1, 'event should include token id');
  EventBus.clear();
});

test('selection.set emits state.selection.changed', () => {
  EventBus.clear();
  GameState.reset();
  let received = null;
  EventBus.on('state.selection.changed', (data) => { received = data; });
  GameState.applyAction({ type: 'selection.set', payload: { tokenId: 42 } });
  assert(received !== null, 'should receive event');
  assertEqual(received.selectedTokenId, 42, 'event should include tokenId');
  EventBus.clear();
});

// ════════════════════════════════════════════════════════════════════════════
//  ACTION QUEUE (DETERMINISTIC)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n📋 GameState — Action Queue');

test('actions are processed in FIFO order', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 1, x: 0, y: 0, hp: 10, maxHp: 10 } });
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 1, x: 1, y: 0 } });
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 1, x: 2, y: 0 } });
  assertEqual(GameState.getToken(1).x, 2, 'final position should be x=2');
});

test('applyAction rejects actions without type', () => {
  GameState.reset();
  // Should not crash
  GameState.applyAction(null);
  GameState.applyAction({});
  GameState.applyAction({ payload: {} });
});

// ════════════════════════════════════════════════════════════════════════════
//  INPUT VALIDATION
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🔒 GameState — Validation');

test('setTokenPosition validates existence', () => {
  GameState.reset();
  // Should not crash for non-existent token
  GameState.applyAction({ type: 'token.setPosition', payload: { id: 999, x: 5, y: 5 } });
  assertEqual(GameState.getToken(999), null, 'non-existent token should still be null');
});

test('setTokenHP validates existence', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.setHP', payload: { id: 999, hp: 50 } });
  // Should not crash
});

test('setTile validates type correctness', () => {
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 10, height: 10 } });
  GameState.applyAction({ type: 'map.setTile', payload: { row: 'invalid', col: 0, type: 'wall' } });
  // Should not crash — invalid types are rejected
});

// ════════════════════════════════════════════════════════════════════════════
//  INTERNAL ACCESS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🔧 GameState — Internal Access');

test('_getTokensRef provides direct access for systems', () => {
  GameState.reset();
  GameState.applyAction({ type: 'token.add', payload: { id: 1, hp: 10, maxHp: 10, name: 'Test' } });
  const ref = GameState._getTokensRef();
  assert(ref[1] !== undefined, 'should have token at key 1');
  assertEqual(ref[1].name, 'Test', 'should have correct name');
});

test('_getMapRef provides direct map access', () => {
  GameState.reset();
  GameState.applyAction({ type: 'map.init', payload: { width: 5, height: 5 } });
  const ref = GameState._getMapRef();
  assertEqual(ref.width, 5, 'width should be 5');
  assertEqual(ref.tiles.length, 5, 'should have 5 rows');
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
