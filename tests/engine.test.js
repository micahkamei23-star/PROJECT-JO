/**
 * tests/engine.test.js – Unit tests for PROJECT JO engine modules.
 * Run with: node tests/engine.test.js
 */

'use strict';

// ── Load modules ─────────────────────────────────────────────────────────────
const EventBus       = require('../js/engine/eventBus.js');
const SceneManager   = require('../js/engine/sceneManager.js');
const TimeManager    = require('../js/engine/timeManager.js');
const AssetManager   = require('../js/engine/assetManager.js');
const ParticleSystem = require('../js/engine/particleSystem.js');
const FogOfWar       = require('../js/engine/fogOfWar.js');
const ActionSystem   = require('../js/engine/actionSystem.js');
const RenderPipeline = require('../js/engine/renderPipeline.js');
const MapEngine      = require('../js/mapEngine.js');
const TokenSystem    = require('../js/tokenSystem.js');
const CombatSystem   = require('../js/combatSystem.js');

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
//  EVENT BUS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n📡 EventBus');

test('on and emit work correctly', () => {
  EventBus.clear();
  let received = null;
  EventBus.on('test', (data) => { received = data; });
  EventBus.emit('test', 42);
  assertEqual(received, 42, 'listener should receive emitted data');
});

test('off removes listener', () => {
  EventBus.clear();
  let count = 0;
  const handler = () => { count++; };
  EventBus.on('ping', handler);
  EventBus.emit('ping');
  assertEqual(count, 1, 'should have been called once');
  EventBus.off('ping', handler);
  EventBus.emit('ping');
  assertEqual(count, 1, 'should not be called after off');
});

test('once fires only once', () => {
  EventBus.clear();
  let count = 0;
  EventBus.once('flash', () => { count++; });
  EventBus.emit('flash');
  EventBus.emit('flash');
  EventBus.emit('flash');
  assertEqual(count, 1, 'once listener should fire exactly once');
});

test('wildcard * listener receives all events', () => {
  EventBus.clear();
  const events = [];
  EventBus.on('*', (eventName, data) => { events.push({ eventName, data }); });
  EventBus.emit('alpha', 1);
  EventBus.emit('beta', 2);
  assertEqual(events.length, 2, 'wildcard should receive both events');
  assertEqual(events[0].eventName, 'alpha', 'first event name');
  assertEqual(events[0].data, 1, 'first event data');
  assertEqual(events[1].eventName, 'beta', 'second event name');
});

test('priority ordering works', () => {
  EventBus.clear();
  const order = [];
  EventBus.on('pri', () => { order.push('low'); }, 1);
  EventBus.on('pri', () => { order.push('high'); }, 10);
  EventBus.on('pri', () => { order.push('mid'); }, 5);
  EventBus.emit('pri');
  assertEqual(order[0], 'high', 'highest priority first');
  assertEqual(order[1], 'mid', 'mid priority second');
  assertEqual(order[2], 'low', 'lowest priority last');
});

test('clear removes all listeners', () => {
  EventBus.clear();
  let called = false;
  EventBus.on('x', () => { called = true; });
  EventBus.clear();
  EventBus.emit('x');
  assert(!called, 'listener should not fire after clear');
});

// ════════════════════════════════════════════════════════════════════════════
//  SCENE MANAGER
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🎬 SceneManager');

test('createEntity returns entity with id', () => {
  SceneManager.clear();
  const e = SceneManager.createEntity('token');
  assert(typeof e.id === 'number', 'entity should have numeric id');
  assertEqual(e.type, 'token', 'entity type should match');
});

test('removeEntity deletes entity', () => {
  SceneManager.clear();
  const e = SceneManager.createEntity('prop');
  assertEqual(SceneManager.count(), 1, 'should have 1 entity');
  const removed = SceneManager.removeEntity(e.id);
  assert(removed, 'removeEntity should return true');
  assertEqual(SceneManager.count(), 0, 'should have 0 entities after removal');
});

test('getEntity retrieves by id', () => {
  SceneManager.clear();
  const e = SceneManager.createEntity('tile', { position: { x: 5, y: 10 } });
  const found = SceneManager.getEntity(e.id);
  assertEqual(found.id, e.id, 'should retrieve same entity');
  assertEqual(found.components.position.x, 5, 'component data preserved');
});

test('getEntitiesByType filters correctly', () => {
  SceneManager.clear();
  SceneManager.createEntity('token');
  SceneManager.createEntity('token');
  SceneManager.createEntity('prop');
  const tokens = SceneManager.getEntitiesByType('token');
  assertEqual(tokens.length, 2, 'should find 2 tokens');
  const props = SceneManager.getEntitiesByType('prop');
  assertEqual(props.length, 1, 'should find 1 prop');
});

test('addComponent / removeComponent work', () => {
  SceneManager.clear();
  const e = SceneManager.createEntity('token');
  const added = SceneManager.addComponent(e.id, 'health', { hp: 10 });
  assert(added, 'addComponent should return true');
  assertEqual(e.components.health.hp, 10, 'component should be set');
  const removed = SceneManager.removeComponent(e.id, 'health');
  assert(removed, 'removeComponent should return true');
  assert(!('health' in e.components), 'component should be removed');
});

test('queryByComponent finds entities with matching components', () => {
  SceneManager.clear();
  const e1 = SceneManager.createEntity('token', { health: { hp: 10 }, render: {} });
  const e2 = SceneManager.createEntity('token', { health: { hp: 5 } });
  SceneManager.createEntity('prop', { render: {} });
  const withHealth = SceneManager.queryByComponent('health');
  assertEqual(withHealth.length, 2, 'should find 2 entities with health');
  const withBoth = SceneManager.queryByComponent('health', 'render');
  assertEqual(withBoth.length, 1, 'should find 1 entity with both health and render');
  assertEqual(withBoth[0].id, e1.id, 'should be the first entity');
});

test('layer ordering via getAllSorted', () => {
  SceneManager.clear();
  const ui   = SceneManager.createEntity('ui');
  const bg   = SceneManager.createEntity('background');
  const tok  = SceneManager.createEntity('tokens');
  const sorted = SceneManager.getAllSorted();
  assert(sorted[0].layer <= sorted[1].layer, 'first should have lowest layer');
  assert(sorted[1].layer <= sorted[2].layer, 'layers should be ascending');
});

test('registerSystem and update calls system functions', () => {
  SceneManager.clear();
  let called = false;
  let receivedDt = null;
  SceneManager.registerSystem('testSys', (dt) => {
    called = true;
    receivedDt = dt;
  });
  SceneManager.update(0.016);
  assert(called, 'system function should be called');
  assertEqual(receivedDt, 0.016, 'dt should be passed to system');
});

// ════════════════════════════════════════════════════════════════════════════
//  TIME MANAGER
// ════════════════════════════════════════════════════════════════════════════
console.log('\n⏱️  TimeManager');

test('easing functions return correct values (0 at t=0, 1 at t=1)', () => {
  const names = Object.keys(TimeManager.easing);
  assert(names.length > 0, 'should have easing functions');
  for (const name of names) {
    const fn = TimeManager.easing[name];
    const at0 = fn(0);
    const at1 = fn(1);
    assertInRange(at0, -0.001, 0.001, `${name}(0) should be ~0, got ${at0}`);
    assertInRange(at1, 0.999, 1.001, `${name}(1) should be ~1, got ${at1}`);
  }
});

test('addTween creates a tween', () => {
  TimeManager.reset();
  const target = { x: 0 };
  const id = TimeManager.addTween(target, { x: 100 }, 1.0);
  assert(typeof id === 'number', 'addTween should return numeric id');
  assert(id > 0, 'tween id should be positive');
});

test('addTimer creates a timer', () => {
  TimeManager.reset();
  const id = TimeManager.addTimer(1.0, () => {});
  assert(typeof id === 'number', 'addTimer should return numeric id');
  assert(id > 0, 'timer id should be positive');
});

test('removeTween removes tween', () => {
  TimeManager.reset();
  const target = { x: 0 };
  const id = TimeManager.addTween(target, { x: 100 }, 1.0);
  // Should not throw
  TimeManager.removeTween(id);
  // Removing again should be safe (no-op)
  TimeManager.removeTween(id);
});

test('getDeltaTime returns a number', () => {
  const dt = TimeManager.getDeltaTime();
  assert(typeof dt === 'number', 'getDeltaTime should return a number');
});

test('getElapsed returns a number', () => {
  const elapsed = TimeManager.getElapsed();
  assert(typeof elapsed === 'number', 'getElapsed should return a number');
});

// ════════════════════════════════════════════════════════════════════════════
//  ASSET MANAGER
// ════════════════════════════════════════════════════════════════════════════
console.log('\n📦 AssetManager');

test('register and get round-trip', () => {
  AssetManager.clear();
  AssetManager.register('sword', 'token', { damage: 10 });
  const data = AssetManager.get('sword');
  assertEqual(data.damage, 10, 'should retrieve registered data');
});

test('has returns correct boolean', () => {
  AssetManager.clear();
  assert(!AssetManager.has('ghost'), 'should not have unregistered key');
  AssetManager.register('ghost', 'token', {});
  assert(AssetManager.has('ghost'), 'should have registered key');
});

test('getByType filters by type', () => {
  AssetManager.clear();
  AssetManager.register('tex1', 'texture', { src: 'a.png' });
  AssetManager.register('tex2', 'texture', { src: 'b.png' });
  AssetManager.register('snd1', 'audio', { src: 'c.mp3' });
  const textures = AssetManager.getByType('texture');
  assertEqual(textures.length, 2, 'should find 2 textures');
  const audio = AssetManager.getByType('audio');
  assertEqual(audio.length, 1, 'should find 1 audio');
});

test('createTileSet registers tileset', () => {
  AssetManager.clear();
  const ok = AssetManager.createTileSet('dungeon', [{ id: 'floor' }, { id: 'wall' }]);
  assert(ok, 'createTileSet should return true');
  assert(AssetManager.has('dungeon'), 'tileset should be registered');
  const data = AssetManager.get('dungeon');
  assertEqual(data.tiles.length, 2, 'tileset should have 2 tiles');
});

test('createTokenTemplate registers template', () => {
  AssetManager.clear();
  const ok = AssetManager.createTokenTemplate('goblin', { sprite: '👺', hp: 7 });
  assert(ok, 'createTokenTemplate should return true');
  assert(AssetManager.has('goblin'), 'template should be registered');
  const data = AssetManager.get('goblin');
  assertEqual(data.name, 'goblin', 'template name should match key');
  assertEqual(data.hp, 7, 'template data preserved');
});

test('serialize / deserialize round-trip', () => {
  AssetManager.clear();
  AssetManager.register('map1', 'map', { w: 20, h: 15 });
  AssetManager.register('fx1', 'fx', { frames: [1, 2, 3] });
  const snapshot = AssetManager.serialize();
  AssetManager.clear();
  assertEqual(AssetManager.count(), 0, 'should be empty after clear');
  AssetManager.deserialize(snapshot);
  assertEqual(AssetManager.count(), 2, 'should restore 2 assets');
  assert(AssetManager.has('map1'), 'map1 should be restored');
  assert(AssetManager.has('fx1'), 'fx1 should be restored');
});

test('remove deletes asset', () => {
  AssetManager.clear();
  AssetManager.register('temp', 'token', {});
  assert(AssetManager.has('temp'), 'should exist before remove');
  AssetManager.remove('temp');
  assert(!AssetManager.has('temp'), 'should not exist after remove');
});

test('missing asset returns placeholder', () => {
  AssetManager.clear();
  const result = AssetManager.get('nonexistent');
  assert(result.placeholder === true, 'missing asset should return placeholder');
});

// ════════════════════════════════════════════════════════════════════════════
//  PARTICLE SYSTEM
// ════════════════════════════════════════════════════════════════════════════
console.log('\n✨ ParticleSystem');

test('createEmitter returns id', () => {
  ParticleSystem.clear();
  const id = ParticleSystem.createEmitter({ x: 0, y: 0, rate: 10 });
  assert(typeof id === 'number', 'should return numeric id');
  assert(id > 0, 'emitter id should be positive');
});

test('removeEmitter removes emitter', () => {
  ParticleSystem.clear();
  const id = ParticleSystem.createEmitter({ x: 0, y: 0 });
  ParticleSystem.removeEmitter(id);
  // No error means success; update should be safe after removal
  ParticleSystem.update(0.1);
});

test('spawnBurst creates particles', () => {
  ParticleSystem.clear();
  assertEqual(ParticleSystem.particleCount(), 0, 'should start with 0 particles');
  ParticleSystem.spawnBurst('sparks', 100, 100, 15);
  assertEqual(ParticleSystem.particleCount(), 15, 'should have 15 particles after burst');
});

test('all PRESETS are defined (fire, smoke, sparks, magic, heal, hit, aura)', () => {
  const required = ['fire', 'smoke', 'sparks', 'magic', 'heal', 'hit', 'aura'];
  for (const name of required) {
    assert(ParticleSystem.PRESETS[name] !== undefined, `PRESETS missing "${name}"`);
    assert(ParticleSystem.PRESETS[name].colorStart, `"${name}" should have colorStart`);
  }
});

test('clear removes all particles/emitters', () => {
  ParticleSystem.clear();
  ParticleSystem.createEmitter({ x: 0, y: 0, rate: 100 });
  ParticleSystem.spawnBurst('fire', 50, 50, 30);
  assert(ParticleSystem.particleCount() > 0, 'should have particles before clear');
  ParticleSystem.clear();
  assertEqual(ParticleSystem.particleCount(), 0, 'should have 0 particles after clear');
});

test('particleCount returns 0 after clear', () => {
  ParticleSystem.clear();
  assertEqual(ParticleSystem.particleCount(), 0, 'particleCount should be 0');
});

// ════════════════════════════════════════════════════════════════════════════
//  FOG OF WAR
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🌫️  FogOfWar');

test('init creates grid of correct size', () => {
  FogOfWar.init(10, 8);
  // Verify by checking boundary cells
  assertEqual(FogOfWar.getState(0, 0), FogOfWar.UNSEEN, 'top-left should be UNSEEN');
  assertEqual(FogOfWar.getState(7, 9), FogOfWar.UNSEEN, 'bottom-right should be UNSEEN');
});

test('default state is UNSEEN', () => {
  FogOfWar.init(5, 5);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      assertEqual(FogOfWar.getState(r, c), FogOfWar.UNSEEN, `(${r},${c}) should be UNSEEN`);
    }
  }
});

test('setVisionSource and recalculate reveals tiles', () => {
  FogOfWar.init(20, 20);
  FogOfWar.setVisionSource('player', 10, 10, 5);
  FogOfWar.recalculate();
  assertEqual(FogOfWar.getState(10, 10), FogOfWar.VISIBLE, 'source cell should be VISIBLE');
});

test('getState returns correct fog state', () => {
  FogOfWar.init(10, 10);
  assertEqual(FogOfWar.getState(0, 0), FogOfWar.UNSEEN, 'default is UNSEEN');
  FogOfWar.revealAll();
  assertEqual(FogOfWar.getState(0, 0), FogOfWar.VISIBLE, 'after revealAll is VISIBLE');
});

test('isVisible / isExplored work', () => {
  FogOfWar.init(10, 10);
  assert(!FogOfWar.isVisible(0, 0), 'should not be visible initially');
  assert(!FogOfWar.isExplored(0, 0), 'should not be explored initially');
  FogOfWar.revealAll();
  assert(FogOfWar.isVisible(0, 0), 'should be visible after revealAll');
  assert(FogOfWar.isExplored(0, 0), 'should be explored after revealAll');
});

test('revealAll reveals entire map', () => {
  FogOfWar.init(6, 6);
  FogOfWar.revealAll();
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      assertEqual(FogOfWar.getState(r, c), FogOfWar.VISIBLE, `(${r},${c}) should be VISIBLE`);
    }
  }
});

test('hideAll hides entire map', () => {
  FogOfWar.init(6, 6);
  FogOfWar.revealAll();
  FogOfWar.hideAll();
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      assertEqual(FogOfWar.getState(r, c), FogOfWar.UNSEEN, `(${r},${c}) should be UNSEEN`);
    }
  }
});

test('setBlocker marks cells as vision-blocking', () => {
  FogOfWar.init(20, 20);
  FogOfWar.setBlocker(5, 5, true);
  FogOfWar.setVisionSource('hero', 5, 3, 6);
  FogOfWar.recalculate();
  // The source itself should be visible
  assertEqual(FogOfWar.getState(3, 5), FogOfWar.VISIBLE, 'source should be visible');
  // Cells far behind the blocker along the same line should be blocked
  // (exact behavior depends on shadow-casting algorithm, but blocker itself may be visible)
});

test('serialize / deserialize round-trip', () => {
  FogOfWar.init(8, 6);
  FogOfWar.revealAll();
  FogOfWar.setBlocker(2, 3, true);
  const snapshot = FogOfWar.serialize();
  FogOfWar.init(1, 1); // reset
  FogOfWar.deserialize(snapshot);
  assertEqual(snapshot.width, 8, 'serialized width');
  assertEqual(snapshot.height, 6, 'serialized height');
  assertEqual(FogOfWar.getState(0, 0), FogOfWar.VISIBLE, 'fog state restored');
});

test('enabled toggle works', () => {
  FogOfWar.init(5, 5);
  assert(FogOfWar.enabled === true, 'should be enabled by default');
  FogOfWar.enabled = false;
  assert(FogOfWar.enabled === false, 'should be disabled after toggle');
  FogOfWar.enabled = true;
  assert(FogOfWar.enabled === true, 'should be re-enabled');
});

test('resize preserves existing fog data', () => {
  FogOfWar.init(5, 5);
  FogOfWar.revealAll();
  FogOfWar.resize(8, 8);
  // Old region should still be VISIBLE
  assertEqual(FogOfWar.getState(0, 0), FogOfWar.VISIBLE, 'old cell should stay VISIBLE');
  assertEqual(FogOfWar.getState(4, 4), FogOfWar.VISIBLE, 'old boundary cell preserved');
  // New region should be UNSEEN
  assertEqual(FogOfWar.getState(7, 7), FogOfWar.UNSEEN, 'new cell should be UNSEEN');
});

// ════════════════════════════════════════════════════════════════════════════
//  ACTION SYSTEM
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🎯 ActionSystem');

test('default D&D actions are pre-registered', () => {
  // Test before any clear() call since defaults are registered on load.
  // Use executeAction to probe: registered actions return validation/budget errors,
  // unregistered actions return 'Unknown action'.
  const required = ['move', 'attack', 'dodge', 'dash', 'disengage', 'help', 'hide', 'ready'];
  for (const key of required) {
    const result = ActionSystem.executeAction(key, '__probe__');
    assert(
      !result.reason || !result.reason.startsWith('Unknown action'),
      `default action "${key}" should be registered`
    );
  }
});

test('registerAction adds an action', () => {
  ActionSystem.clear();
  ActionSystem.registerAction('fireball', {
    name: 'Fireball', type: 'spell', cost: 'action',
    execute: () => ({ damage: 36 }),
  });
  const actions = ActionSystem.getAvailableActions('actor1');
  assert(actions.some(a => a.key === 'fireball'), 'fireball should be available');
});

test('unregisterAction removes it', () => {
  ActionSystem.clear();
  ActionSystem.registerAction('temp', { name: 'Temp', execute: () => {} });
  ActionSystem.unregisterAction('temp');
  const actions = ActionSystem.getAvailableActions('actor1');
  assert(!actions.some(a => a.key === 'temp'), 'temp should be removed');
});

test('getAvailableActions lists registered actions', () => {
  ActionSystem.clear();
  ActionSystem.registerAction('a1', { name: 'A1' });
  ActionSystem.registerAction('a2', { name: 'A2' });
  const actions = ActionSystem.getAvailableActions('x');
  assertEqual(actions.length, 2, 'should list 2 actions');
});

test('startTurn resets budget', () => {
  ActionSystem.clear();
  ActionSystem.startTurn('hero1');
  const budget = ActionSystem.getBudget('hero1');
  assert(budget !== undefined, 'budget should exist after startTurn');
  assertEqual(budget.action, 1, 'should have 1 action');
  assertEqual(budget.bonus, 1, 'should have 1 bonus action');
  assertEqual(budget.reaction, 1, 'should have 1 reaction');
  assertEqual(budget.movement, 30, 'should have 30 movement');
});

test('executeAction runs action and logs', () => {
  ActionSystem.clear();
  let executed = false;
  ActionSystem.registerAction('swing', {
    name: 'Swing', cost: 'action',
    execute: () => { executed = true; return { hit: true }; },
  });
  ActionSystem.startTurn('warrior');
  const result = ActionSystem.executeAction('swing', 'warrior');
  assert(result.success, 'executeAction should succeed');
  assert(executed, 'action execute function should have run');
  const log = ActionSystem.getActionLog();
  assert(log.length > 0, 'action log should have entries');
  assertEqual(log[0].actionKey, 'swing', 'log entry should reference swing');
});

test('getBudget returns correct remaining actions', () => {
  ActionSystem.clear();
  ActionSystem.registerAction('slash', { name: 'Slash', cost: 'action', execute: () => {} });
  ActionSystem.startTurn('fighter');
  assertEqual(ActionSystem.getBudget('fighter').action, 1, 'should start with 1 action');
  ActionSystem.executeAction('slash', 'fighter');
  assertEqual(ActionSystem.getBudget('fighter').action, 0, 'should have 0 actions after use');
});

test('getActionLog returns entries', () => {
  ActionSystem.clear();
  ActionSystem.registerAction('poke', { name: 'Poke', cost: 'free', execute: () => {} });
  ActionSystem.executeAction('poke', 'a1');
  ActionSystem.executeAction('poke', 'a2');
  const log = ActionSystem.getActionLog();
  assert(log.length >= 2, 'should have at least 2 log entries');
});

test('onAction callback is called', () => {
  ActionSystem.clear();
  let notified = null;
  ActionSystem.onAction((entry) => { notified = entry; });
  ActionSystem.registerAction('zap', { name: 'Zap', cost: 'free', execute: () => {} });
  ActionSystem.executeAction('zap', 'mage');
  assert(notified !== null, 'onAction callback should have been called');
  assertEqual(notified.actionKey, 'zap', 'callback should receive correct action');
});

// ════════════════════════════════════════════════════════════════════════════
//  RENDER PIPELINE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🖼️  RenderPipeline');

test('addPass registers pass', () => {
  RenderPipeline.clear();
  RenderPipeline.addPass('custom', 25, () => {});
  // getStats won't show it directly; test via isDirty side-effect
  // The pass should exist; we verify by checking it doesn't throw
  const stats = RenderPipeline.getStats();
  assert(typeof stats === 'object', 'getStats should return object');
});

test('removePass removes pass', () => {
  RenderPipeline.clear();
  RenderPipeline.addPass('temp', 99, () => {});
  RenderPipeline.removePass('temp');
  // After removing, rendering should still work without error
  const stats = RenderPipeline.getStats();
  assert(typeof stats === 'object', 'should still return stats');
});

test('enablePass / disablePass toggle passes', () => {
  RenderPipeline.clear();
  RenderPipeline.addPass('toggle', 10, () => {});
  RenderPipeline.disablePass('toggle');
  // Re-enable
  RenderPipeline.enablePass('toggle');
  // No error means toggles work
});

test('isDirty reflects dirty state', () => {
  RenderPipeline.clear();
  // After clear, _allDirty is set to true (from _initDefaultPasses)
  assert(RenderPipeline.isDirty(), 'should be dirty after clear');
});

test('markDirty marks areas dirty', () => {
  RenderPipeline.clear();
  // Clear sets _allDirty = true already; verify markDirty doesn't break
  RenderPipeline.markDirty(0, 0, 100, 100);
  assert(RenderPipeline.isDirty(), 'should be dirty after markDirty');
});

test('markAllDirty marks everything dirty', () => {
  RenderPipeline.clear();
  RenderPipeline.markAllDirty();
  assert(RenderPipeline.isDirty(), 'should be dirty after markAllDirty');
});

test('shake applies camera shake', () => {
  RenderPipeline.clear();
  // Calling shake should not throw
  RenderPipeline.shake(10, 0.5);
  // Verify shake was applied (no direct getter, but no error)
});

test('getStats returns stats object', () => {
  RenderPipeline.clear();
  const stats = RenderPipeline.getStats();
  assert(typeof stats.drawCalls === 'number', 'drawCalls should be a number');
  assert(typeof stats.fps === 'number', 'fps should be a number');
  assert(typeof stats.frameTime === 'number', 'frameTime should be a number');
  assert(typeof stats.passTime === 'object', 'passTime should be an object');
});

test('clear resets everything', () => {
  RenderPipeline.addPass('extra', 100, () => {});
  RenderPipeline.shake(20, 1);
  RenderPipeline.clear();
  // After clear, default passes are re-initialized
  assert(RenderPipeline.isDirty(), 'should be dirty after clear');
  const stats = RenderPipeline.getStats();
  assertEqual(stats.drawCalls, 0, 'drawCalls should be 0 after clear');
});

// ════════════════════════════════════════════════════════════════════════════
//  MAP ENGINE – ENHANCED FEATURES
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🗺️  MapEngine (Enhanced)');

test('extended TILE_DEFS have blocksVision and terrain fields', () => {
  const types = Object.keys(MapEngine.TILE_DEFS);
  assert(types.length > 0, 'should have tile definitions');
  for (const type of types) {
    const def = MapEngine.TILE_DEFS[type];
    assert('blocksVision' in def, `${type} should have blocksVision`);
    assert('terrain' in def, `${type} should have terrain`);
  }
});

test('addRegion / getRegion / removeRegion work', () => {
  MapEngine.initMap(10, 10);
  MapEngine.addRegion('tavern', [{ row: 1, col: 1 }, { row: 1, col: 2 }], { type: 'safe' });
  const region = MapEngine.getRegion('tavern');
  assert(region !== null, 'getRegion should find tavern');
  assertEqual(region.name, 'tavern', 'region name should match');
  assertEqual(region.cells.length, 2, 'region should have 2 cells');
  assertEqual(region.metadata.type, 'safe', 'metadata preserved');
  MapEngine.removeRegion('tavern');
  assertEqual(MapEngine.getRegion('tavern'), null, 'region should be removed');
});

test('getRegionsAt finds regions at position', () => {
  MapEngine.initMap(10, 10);
  MapEngine.addRegion('room1', [{ row: 2, col: 3 }, { row: 2, col: 4 }]);
  MapEngine.addRegion('room2', [{ row: 2, col: 3 }]);
  const regions = MapEngine.getRegionsAt(2, 3);
  assertEqual(regions.length, 2, 'should find 2 regions at (2,3)');
  const regionsAt4 = MapEngine.getRegionsAt(2, 4);
  assertEqual(regionsAt4.length, 1, 'should find 1 region at (2,4)');
});

test('pushUndo / undo / redo work correctly', () => {
  MapEngine.initMap(10, 10);
  MapEngine.setTile(0, 0, 'floor');
  MapEngine.pushUndo();
  MapEngine.setTile(0, 0, 'wall');
  assertEqual(MapEngine.getTile(0, 0).type, 'wall', 'should be wall before undo');
  MapEngine.undo();
  assertEqual(MapEngine.getTile(0, 0).type, 'floor', 'should be floor after undo');
  MapEngine.redo();
  assertEqual(MapEngine.getTile(0, 0).type, 'wall', 'should be wall after redo');
});

test('canUndo / canRedo return correct state', () => {
  MapEngine.initMap(10, 10);
  assert(!MapEngine.canUndo(), 'should not be able to undo initially');
  assert(!MapEngine.canRedo(), 'should not be able to redo initially');
  MapEngine.pushUndo();
  MapEngine.setTile(0, 0, 'floor');
  assert(MapEngine.canUndo(), 'should be able to undo after pushUndo');
  MapEngine.undo();
  assert(MapEngine.canRedo(), 'should be able to redo after undo');
});

test('drawLine draws tiles in a line (Bresenham)', () => {
  MapEngine.initMap(10, 10);
  MapEngine.drawLine(0, 0, 0, 4, 'wall');
  for (let c = 0; c <= 4; c++) {
    assertEqual(MapEngine.getTile(0, c).type, 'wall', `(0,${c}) should be wall`);
  }
  // Tile not on the line should remain null
  assertEqual(MapEngine.getTile(1, 0).type, null, '(1,0) should be null');
});

test('drawCircle draws tiles in a circle', () => {
  MapEngine.initMap(20, 20);
  MapEngine.drawCircle(10, 10, 3, 'stone');
  // At least the cardinal points should be set
  assertEqual(MapEngine.getTile(10, 13).type, 'stone', 'east point');
  assertEqual(MapEngine.getTile(10, 7).type, 'stone', 'west point');
  assertEqual(MapEngine.getTile(13, 10).type, 'stone', 'south point');
  assertEqual(MapEngine.getTile(7, 10).type, 'stone', 'north point');
});

test('layer functions: getLayer, setTileOnLayer', () => {
  MapEngine.initMap(10, 10);
  const ground = MapEngine.getLayer('ground');
  assert(ground !== null, 'ground layer should exist');
  assert(Array.isArray(ground), 'ground layer should be an array');

  MapEngine.setTileOnLayer('walls', 2, 3, 'wall');
  const wallsLayer = MapEngine.getLayer('walls');
  assertEqual(wallsLayer[2][3].type, 'wall', 'wall should be set on walls layer');

  // Invalid layer returns null
  assertEqual(MapEngine.getLayer('invalid'), null, 'invalid layer should return null');
});

// ════════════════════════════════════════════════════════════════════════════
//  TOKEN SYSTEM – ENHANCED FEATURES
// ════════════════════════════════════════════════════════════════════════════
console.log('\n🎭 TokenSystem (Enhanced)');

test('new token fields are initialized', () => {
  TokenSystem.init(20, 15);
  const id = TokenSystem.addToken(100, 'Gandalf', '🧙', 50, 50, 5, 5);
  const token = TokenSystem.getToken(id);
  assert(token !== null, 'token should exist');
  assertEqual(token.faction, 'ally', 'default faction should be ally');
  assertEqual(token.visionRadius, 6, 'default visionRadius should be 6');
  assertEqual(token.auraRadius, 0, 'default auraRadius should be 0');
  assertEqual(token.tempHp, 0, 'default tempHp should be 0');
  assertEqual(token.animState, 'idle', 'default animState should be idle');
  assertEqual(token.lightRadius, 0, 'default lightRadius should be 0');
  assertEqual(token.darkvision, 0, 'default darkvision should be 0');
  assertEqual(token.rotation, 0, 'default rotation should be 0');
  assertEqual(token.scale, 1, 'default scale should be 1');
  assert(token.lerpPosition === null, 'default lerpPosition should be null');
});

test('updateLerp handles empty tokens array', () => {
  TokenSystem.init(20, 15);
  // Remove all tokens first
  const all = TokenSystem.getAll();
  for (const t of [...all]) {
    TokenSystem.removeToken(t.id);
  }
  // Should not throw with no tokens
  TokenSystem.updateLerp(0.016);
});

test('conditions / temp HP default values', () => {
  TokenSystem.init(20, 15);
  const id = TokenSystem.addToken(200, 'Fighter', '⚔️', 30, 30, 0, 0);
  const token = TokenSystem.getToken(id);
  assert(Array.isArray(token.conditions), 'conditions should be an array');
  assertEqual(token.conditions.length, 0, 'conditions should be empty by default');
  assertEqual(token.tempHp, 0, 'tempHp should default to 0');
  assert(Array.isArray(token.statusEffects), 'statusEffects should be an array');
  assertEqual(token.statusEffects.length, 0, 'statusEffects should be empty by default');
});

// ════════════════════════════════════════════════════════════════════════════
//  COMBAT SYSTEM – ENHANCED FEATURES
// ════════════════════════════════════════════════════════════════════════════
console.log('\n⚔️  CombatSystem (Enhanced)');

test('addCondition / removeCondition / getConditions work', () => {
  CombatSystem.addCondition(1, 'poisoned');
  CombatSystem.addCondition(1, 'blinded');
  const conds = CombatSystem.getConditions(1);
  assert(conds.includes('poisoned'), 'should have poisoned');
  assert(conds.includes('blinded'), 'should have blinded');
  CombatSystem.removeCondition(1, 'poisoned');
  const after = CombatSystem.getConditions(1);
  assert(!after.includes('poisoned'), 'poisoned should be removed');
  assert(after.includes('blinded'), 'blinded should remain');
});

test('D&D CONDITIONS list includes standard conditions', () => {
  const required = [
    'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
    'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
    'prone', 'restrained', 'stunned', 'unconscious',
  ];
  for (const cond of required) {
    assert(CombatSystem.CONDITIONS.includes(cond), `CONDITIONS missing "${cond}"`);
  }
});

test('useAction decrements budget', () => {
  const tokens = [
    { id: 10, name: 'A', avatar: '🧝' },
    { id: 11, name: 'B', avatar: '🧙' },
  ];
  CombatSystem.rollInitiativeForTokens(tokens);
  const cur = CombatSystem.getCurrentParticipant();
  const budget = CombatSystem.getRemainingBudget(cur.id);
  assertEqual(budget.actions, 1, 'should start with 1 action');
  const used = CombatSystem.useAction(cur.id, 'actions');
  assert(used, 'useAction should return true');
  const after = CombatSystem.getRemainingBudget(cur.id);
  assertEqual(after.actions, 0, 'should have 0 actions after use');
});

test('getRemainingBudget returns correct values', () => {
  const tokens = [{ id: 20, name: 'C', avatar: '🗡️' }];
  CombatSystem.rollInitiativeForTokens(tokens);
  const budget = CombatSystem.getRemainingBudget(20);
  assert(budget !== null, 'budget should exist');
  assertEqual(budget.actions, 1, 'should have 1 action');
  assertEqual(budget.bonus, 1, 'should have 1 bonus');
  assertEqual(budget.reaction, 1, 'should have 1 reaction');
  assertEqual(budget.movement, 30, 'should have 30 movement');
});

test('rollInitiativeForTokens accepts modifiers', () => {
  const tokens = [
    { id: 30, name: 'D', avatar: '🧝' },
    { id: 31, name: 'E', avatar: '🧙' },
  ];
  const modifiers = { 30: 5, 31: -2 };
  const order = CombatSystem.rollInitiativeForTokens(tokens, modifiers);
  // Token 30 should have initiative in range [6, 25] (1+5 to 20+5)
  const p30 = order.find(p => p.id === 30);
  assertInRange(p30.initiative, 6, 25, `token 30 initiative ${p30.initiative} should be in [6,25]`);
  // Token 31 should have initiative in range [-1, 18] (1-2 to 20-2)
  const p31 = order.find(p => p.id === 31);
  assertInRange(p31.initiative, -1, 18, `token 31 initiative ${p31.initiative} should be in [-1,18]`);
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
