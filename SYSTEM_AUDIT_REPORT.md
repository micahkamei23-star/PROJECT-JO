# PROJECT-JO System Audit Report

**Date:** 2026-03-18
**Scope:** Full codebase (~16,500 LOC across 34 files)
**Architecture:** Vanilla JS IIFE modules, Canvas 2D rendering, D&D 5e VTT
**Auditor posture:** Conservative — no unnecessary edits; surgical fixes only

---

## CRITICAL Severity

### C-01: GameState.js Missing from Script Loading Order

- **Severity:** CRITICAL
- **Exact Location:** `index.html:521–553` (script tags section)
- **Explanation:** `js/engine/GameState.js` is never included in `index.html`. Both `tokenSystem.js` (line 37–48) and `combatSystem.js` (line 13–24) resolve GameState at module-parse time via `typeof GameState !== 'undefined'`. Since the script is never loaded, `GameState` is always `undefined` in the browser. Both modules fall through to `require()`, which also fails in a browser environment, resulting in `_GS = null`. Every subsequent call to `_GS.applyAction(...)`, `_GS.getAllTokens()`, `_GS.getToken()`, etc. will throw `TypeError: Cannot read properties of null`.
- **Root Cause:** `GameState.js` was either accidentally removed from the HTML or never added after being created.
- **Reproduction:** Open `index.html` in a browser. Click on the map canvas or attempt any token operation. Console will show `TypeError: Cannot read properties of null (reading 'applyAction')`.
- **Minimal Fix:** Add `<script src="js/engine/GameState.js"></script>` to `index.html` immediately after `eventBus.js` (line 523) and before any module that depends on it. GameState depends only on EventBus, so it must load after eventBus.js but before sceneManager.js or at minimum before tokenSystem.js.
- **Risk of Fixing:** Very low. GameState has no load-order dependencies other than EventBus, which already loads first.

---

### C-02: Dual Source of Truth for Map Tiles (MapEngine vs GameState)

- **Severity:** CRITICAL
- **Exact Location:** `js/mapEngine.js:56–68` (`mapState` object) vs `js/engine/GameState.js:48–55` (`_state.map`)
- **Explanation:** MapEngine maintains its own `mapState.tiles` 2D array that the entire rendering pipeline reads from (`map.js`, `tileRenderer.js`, `fogOfWar.js`). GameState also maintains `_state.map.tiles` with its own `map.setTile` action. These two tile stores are completely independent — writes to one do not propagate to the other. This means undo/redo through GameState does not affect what is rendered, and painting tiles via MapEngine does not enter GameState's history.
- **Root Cause:** MapEngine was likely the original tile system. GameState was added later with its own map actions, but the two were never unified.
- **Reproduction:** (1) Paint tiles on the map — tiles appear via MapEngine. (2) Call `GameState.applyAction({ type: 'map.setTile', ... })` — MapEngine.mapState is unaffected, so the change is invisible. (3) Use GameState undo — the map rendering doesn't change because it reads from MapEngine.
- **Minimal Fix:** Designate one system as authoritative. The simplest path: make MapEngine the sole authority for tile data and remove or redirect GameState's `map.setTile` / `map.resize` actions to call through MapEngine. Alternatively, have MapEngine read from GameState, but this requires deeper rewiring.
- **Risk of Fixing:** Medium. This is an architectural decision affecting undo/redo, persistence, and all tile rendering code. Requires careful integration testing.

---

### C-03: Dual Undo/Redo Systems Operating on Different State

- **Severity:** CRITICAL
- **Exact Location:** `js/mapEngine.js:78–111` (snapshot-based undo) vs `js/engine/GameState.js:434–499` (inverse-action undo)
- **Explanation:** MapEngine has `pushUndo()`, `undo()`, `redo()` operating on tile snapshots. GameState has `undo()`, `redo()` operating on action history with inverse actions. These two undo systems are completely independent. A user pressing "undo" will invoke one or the other depending on which is wired to the UI, but never both. Token moves tracked by GameState cannot be undone by MapEngine's undo, and tile paints tracked by MapEngine cannot be undone by GameState's undo.
- **Root Cause:** Same as C-02 — two state management systems coexisting without integration.
- **Reproduction:** Paint tiles (tracked by MapEngine). Move a token (tracked by GameState). Press undo — only one operation type can be reversed.
- **Minimal Fix:** Unify under one undo system. If MapEngine is chosen as tile authority (per C-02), route all undoable operations through a single history. Alternatively, implement a unified undo stack that delegates to the appropriate subsystem.
- **Risk of Fixing:** Medium-high. Requires architectural alignment between the two systems.

---

## HIGH Severity

### H-01: RenderPipeline Camera Shake dt Always Zero

- **Severity:** HIGH
- **Exact Location:** `js/engine/renderPipeline.js:151–155`
- **Explanation:** On line 151, `_lastFrameTs = now;` is assigned. Then on line 155, `const dt = _lastFrameTs > 0 ? (now - _lastFrameTs) / 1000 : 0;` — since `_lastFrameTs` was just set to `now`, the expression `now - _lastFrameTs` is always `0`. Therefore `_shakeElapsed` never advances, camera shake never decays, and the shake effect either never visually works or produces a static random offset that never resolves.
- **Root Cause:** The FPS tracking block (lines 141–151) sets `_lastFrameTs = now` before the shake block reads it.
- **Reproduction:** Call `RenderPipeline.shake(intensity, duration)` during gameplay. The shake offset will be calculated but `_shakeElapsed` will never increase beyond 0, so `progress` stays at 0 and the shake never completes — it runs indefinitely until duration-related code is hit by the `>= 1` check (which it won't be since progress = 0/duration = 0/duration ≠ 0 means progress = 0).
- **Minimal Fix:** Capture the shake dt *before* updating `_lastFrameTs`:
  ```js
  const shakeDt = _lastFrameTs > 0 ? (now - _lastFrameTs) / 1000 : 0;
  _lastFrameTs = now;
  // ... then use shakeDt for _shakeElapsed
  ```
- **Risk of Fixing:** Very low. Only affects the shake timing calculation.

---

### H-02: FogOfWar Darkvision Type Coercion Discards Radius Information

- **Severity:** HIGH
- **Exact Location:** `js/engine/fogOfWar.js:177–184` (`setVisionSource`) and `js/engine/fogOfWar.js:209–213` (`recalculate`)
- **Explanation:** `setVisionSource()` stores `darkvision: !!darkvision`, coercing a numeric value (tiles of darkvision range, e.g. `12`) to boolean `true`. In `recalculate()` (line 211), `src.darkvision` being `true` causes a blanket `radius * 2` multiplier. This means a token with darkvision 2 gets the same 2× bonus as darkvision 12. The actual darkvision range value is lost.
- **Root Cause:** The JSDoc declares `darkvision` as `boolean`, but the calling code in `map.js:157` passes `tok.darkvision || 0` which is a number (tile count). The interface contract is mismatched.
- **Reproduction:** Create two tokens: one with `darkvision: 2`, one with `darkvision: 12`. Both will receive identical `radius * 2` vision in fog calculations.
- **Minimal Fix:** Store darkvision as a number: `darkvision: darkvision || 0`. In `recalculate()`, use: `const effectiveRadius = src.darkvision > 0 ? src.radius + src.darkvision : src.radius;` (or whatever the intended D&D 5e formula should be).
- **Risk of Fixing:** Low. Only changes fog calculation for darkvision tokens.

---

### H-03: EventBus.on() Returns Undefined — AudioHooks Unsubscribe Pattern Broken

- **Severity:** HIGH
- **Exact Location:** `js/engine/eventBus.js:57–59` (`on` function) and `js/audioHooks.js` (all `EventBus.on()` calls stored for later unsubscribe)
- **Explanation:** `EventBus.on()` does not return a value (implicitly `undefined`). If AudioHooks (or any module) stores the return value expecting an unsubscribe function, calling it later will throw `TypeError: unsub is not a function`. This means AudioHooks can never cleanly unsubscribe from events, leading to listener accumulation if audio is toggled on/off.
- **Root Cause:** Common pub/sub pattern is to return an unsubscribe function from `on()`, but EventBus omits this.
- **Reproduction:** Call AudioHooks functions that register EventBus listeners, then attempt to unsubscribe by calling the stored return values.
- **Minimal Fix:** Have `EventBus.on()` return an unsubscribe function:
  ```js
  function on(event, callback, priority) {
    _addListener(event, callback, priority || 0, false);
    return () => off(event, callback);
  }
  ```
- **Risk of Fixing:** Very low. Additive change; no existing behavior changes since the return value was `undefined` before.

---

### H-04: PerformanceManager Calls Non-Existent ParticleSystem.setMaxParticles()

- **Severity:** HIGH
- **Exact Location:** `js/PerformanceManager.js:66–67`
- **Explanation:** PerformanceManager checks `typeof ParticleSystem.setMaxParticles === 'function'` before calling it. ParticleSystem does not expose a `setMaxParticles` method. The typeof guard prevents a runtime crash, but the adaptive quality system silently fails to limit particle counts. Under load, particle budget is never throttled, defeating the purpose of the performance manager for particles.
- **Root Cause:** API mismatch — PerformanceManager was written expecting a ParticleSystem API that doesn't exist.
- **Reproduction:** Trigger many particle effects simultaneously. PerformanceManager will detect low FPS and attempt to reduce quality, but particle count remains unlimited at 5000.
- **Minimal Fix:** Add `setMaxParticles(n)` to ParticleSystem's public API that updates `MAX_PARTICLES`. Or adjust PerformanceManager to use the existing ParticleSystem API.
- **Risk of Fixing:** Very low. Additive API surface.

---

### H-05: CombatSystem.init() Overwrites Callback on Every setCombatCallback Call

- **Severity:** HIGH
- **Exact Location:** `js/combatSystem.js:41–43` and `js/map.js:592`
- **Explanation:** `CombatSystem.init(updateCallback)` simply sets `_onUpdate = updateCallback`. `map.js:60` calls `CombatSystem.init(null)` during map init, then `main.js:635` calls `MapEditor.setCombatCallback(renderCombatTracker)` which calls `CombatSystem.init(cb)` again. If any additional module calls `init()`, the previous callback is silently overwritten with no warning. This is fragile — the combat tracker UI relies on this single callback.
- **Root Cause:** `init()` serves double duty as both initializer and callback setter with no protection against re-initialization.
- **Reproduction:** Call `CombatSystem.init(callbackA)` then `CombatSystem.init(callbackB)` — `callbackA` is silently dropped. If combat state changes occur between the two calls (while callback is `null` from `map.js:60`), the UI won't update.
- **Minimal Fix:** Separate initialization from callback registration. Add a `setUpdateCallback(cb)` method, and have `init()` only do first-time setup. Or, use EventBus to broadcast combat updates instead of a single callback.
- **Risk of Fixing:** Low. Additive change.

---

## MEDIUM Severity

### M-01: Token ID Collision Risk

- **Severity:** MEDIUM
- **Exact Location:** `js/tokenSystem.js:137`
- **Explanation:** Token IDs are generated as `Date.now() + Math.floor(Math.random() * 1e6)`. `Date.now()` has millisecond resolution. `Math.random() * 1e6` adds 0–999999. If two tokens are created in the same millisecond (e.g., batch import, rapid programmatic creation), there's a ~0.1% collision probability per pair (birthday problem across 1M space). In the context of `clearAll()` (line 126–132), which removes all tokens and re-adds them, this can create ID collisions within a single operation.
- **Root Cause:** Non-cryptographic, time-dependent ID generation without collision checking.
- **Reproduction:** Call `addToken()` in a tight loop 100+ times. Some IDs will collide, causing `token.add` to overwrite existing tokens silently in the GameState Map.
- **Minimal Fix:** Add a monotonic counter: `let _nextId = 0; function _genId() { return Date.now() + '_' + (++_nextId); }` or use `crypto.randomUUID()` if browser support allows.
- **Risk of Fixing:** Low, but changes token ID format which may affect serialization/persistence if any exists.

---

### M-02: updateLerp() Dispatches GameState Actions Every Frame During Animation

- **Severity:** MEDIUM
- **Exact Location:** `js/tokenSystem.js:707–724`
- **Explanation:** During smooth token movement (lerp), `updateLerp()` is called every animation frame. When the lerp completes (`progress >= 1`), it calls `_GS.applyAction({ type: 'token.setPosition', ... })` which is correct. However, during the lerp, every frame still reads from GameState via `_GS.getTokensArray()`, creating copies each frame. If the lerp system were to dispatch intermediate position updates (which it currently does not — only on completion), it would flood the action queue. The current implementation is acceptable but the per-frame `getTokensArray()` call creates unnecessary object allocations during animations.
- **Root Cause:** No local caching of token data during animation frames.
- **Reproduction:** Move multiple tokens simultaneously while monitoring memory allocation. Each frame allocates a new array from `getTokensArray()`.
- **Minimal Fix:** Cache the token array reference at lerp start and only re-fetch from GameState when lerp completes. However, this is an optimization, not a bug fix.
- **Risk of Fixing:** Low.

---

### M-03: _hasAnimatedTiles() Scans Entire Map Grid Every Frame

- **Severity:** MEDIUM
- **Exact Location:** `js/map.js:230–237`
- **Explanation:** `_hasAnimatedTiles()` iterates over every cell in the `MapEngine.mapState.tiles` grid to check if any tile has `animated: true`. This runs every frame in the render loop (line 208) to determine if re-rendering is needed. For a 100×100 map, that's 10,000 iterations per frame (60× per second = 600,000 checks/sec).
- **Root Cause:** No tracking of animated tile count when tiles are set/removed.
- **Reproduction:** Create a large map (100×100+). Monitor frame time — the animated tile scan contributes measurable overhead even when no animated tiles exist.
- **Minimal Fix:** Maintain an `_animatedTileCount` counter. Increment when an animated tile is placed, decrement when removed. Check `_animatedTileCount > 0` instead of scanning.
- **Risk of Fixing:** Low, but requires hooking into all tile mutation paths.

---

### M-04: Multiple Independent requestAnimationFrame Loops

- **Severity:** MEDIUM
- **Exact Location:** `js/map.js:217–219` (map render loop), `js/main.js:944–946` (atmospheric effects loop), `js/engine/timeManager.js:98,151` (game loop — unused)
- **Explanation:** The application runs at least two independent RAF loops: the map render loop in `map.js` and the atmospheric effects loop in `main.js`. These are uncoordinated — each runs at its own pace, potentially causing frame-rate contention, double-rendering in the same frame, or visual tearing between canvas layers. TimeManager has a third RAF loop that is currently not started by main.js.
- **Root Cause:** Each system was built independently with its own animation loop rather than sharing a central game loop.
- **Reproduction:** Open DevTools Performance tab. Observe two separate RAF callback stacks per frame.
- **Minimal Fix:** Consolidate into a single RAF loop (e.g., in map.js or a dedicated game loop) that calls subsystem update methods in order. Or, accept the current architecture if the atmospheric effects operate on a separate canvas/overlay.
- **Risk of Fixing:** Medium. Requires coordinating update order and ensuring no system depends on running in its own loop.

---

### M-05: GameState.getMapTilesRaw() Bypasses Immutability Protection

- **Severity:** MEDIUM
- **Exact Location:** `js/engine/GameState.js:261–263`
- **Explanation:** `getMapTilesRaw()` returns a direct reference to `_state.map.tiles`, explicitly bypassing the deep-copy/freeze protections that other getters provide. The comment says "MUST NOT be mutated", but there's no enforcement. Any consumer that accidentally mutates the returned array corrupts internal state without going through `applyAction()`, breaking undo/redo and event notifications.
- **Root Cause:** Performance optimization for flood-fill reads that sacrifices safety.
- **Reproduction:** Call `GameState.getMapTilesRaw()` and modify a tile object in the returned array. The internal state is silently corrupted.
- **Minimal Fix:** If dev mode is enabled, return a frozen proxy or shallow-frozen copy. In production, accept the risk with the existing comment-based contract. Alternatively, provide a read-only Proxy wrapper in dev mode.
- **Risk of Fixing:** Low for dev-mode-only enforcement. Higher if deep-copying is added (performance cost for large maps).

---

### M-06: _syncFogBlockers() Iterates Entire Map Grid on Every Call

- **Severity:** MEDIUM
- **Exact Location:** `js/map.js` (the `_syncFogBlockers` function)
- **Explanation:** `_syncFogBlockers()` loops through every cell in the map to sync wall/blocker data to the FogOfWar module. This is called during fog recalculation events. For large maps, this is O(width × height) every time any tile changes.
- **Root Cause:** No incremental/dirty-cell tracking for fog blockers.
- **Reproduction:** On a large map, change a single tile and observe that the entire grid is re-scanned for blockers.
- **Minimal Fix:** Track which cells changed and only update those blocker entries. Or accept the current approach if fog recalculation is infrequent.
- **Risk of Fixing:** Low.

---

### M-07: MapEngine.setTile() Does Not Auto-Push Undo

- **Severity:** MEDIUM
- **Exact Location:** `js/mapEngine.js:147–152`
- **Explanation:** `setTile(row, col, type)` directly mutates `mapState.tiles` without pushing to the undo stack. The caller must explicitly call `pushUndo()` before any tile operation to preserve state. If any caller forgets, the undo history is incomplete or corrupt — undo will revert to a stale snapshot.
- **Root Cause:** The undo system is snapshot-based and requires explicit opt-in before mutations.
- **Reproduction:** Call `MapEngine.setTile()` without calling `MapEngine.pushUndo()` first, then call `MapEngine.undo()` — the tile change is not reverted because no snapshot was taken.
- **Minimal Fix:** Either auto-push undo in `setTile()` (with debounce to avoid per-cell snapshots during drag-painting), or add a warning in dev mode when `setTile()` is called without a preceding `pushUndo()`.
- **Risk of Fixing:** Low-medium. Auto-push needs debouncing to avoid excessive snapshots.

---

### M-08: SceneManager, TimeManager, AssetManager, ActionSystem Loaded but Unused

- **Severity:** MEDIUM (dead code / unnecessary payload)
- **Exact Location:** `index.html:524–529` (sceneManager, timeManager, assetManager, actionSystem scripts)
- **Explanation:** These four engine modules are loaded via script tags but never initialized or called by `main.js` or any other module in the runtime path. They consume ~1100 lines of parse/compile time and occupy global namespace slots. ActionSystem's D&D action economy duplicates functionality in CombatSystem.
- **Root Cause:** These appear to be planned/scaffolded systems that were never integrated.
- **Reproduction:** Search for any call to `SceneManager.*`, `TimeManager.*`, `AssetManager.*`, or `ActionSystem.*` in the codebase outside their own files — none exist in runtime code paths.
- **Minimal Fix:** Either remove the script tags from index.html (they can be re-added when needed), or add a comment clarifying they are scaffolding for future use.
- **Risk of Fixing:** Very low. No runtime code depends on them.

---

## LOW Severity

### L-01: GameState.reset() Does Not Clear combat.conditions

- **Severity:** LOW
- **Exact Location:** `js/engine/GameState.js` (`reset()` function)
- **Explanation:** The `reset()` function clears tokens, map, selection, combat order/round/turn, and combat budgets, but explicitly preserves `combat.conditions` with the comment "Keep conditions across resets." While intentional, this means conditions (stunned, poisoned, etc.) from a previous session persist into a new game, which may confuse users.
- **Root Cause:** Intentional design choice, but potentially surprising behavior.
- **Reproduction:** Apply conditions to tokens, then call `GameState.reset()`. Conditions persist.
- **Minimal Fix:** If this is intentional, add a `resetAll()` that also clears conditions, or add a parameter `reset({ keepConditions: true })`.
- **Risk of Fixing:** Very low.

---

### L-02: Binary Insert in EventBus Uses Unstable Sort for Equal Priorities

- **Severity:** LOW
- **Exact Location:** `js/engine/eventBus.js:37–48`
- **Explanation:** The binary insert uses `>=` on line 42 (`list[mid].priority >= priority`), which inserts new listeners *after* existing listeners with the same priority. This is FIFO within a priority level, which is reasonable. However, this behavior is undocumented, and if a consumer expects LIFO (last-registered-first-called) semantics at equal priority, they'll get unexpected ordering.
- **Root Cause:** Implicit ordering choice in the binary insert.
- **Reproduction:** Register two listeners at priority 0 for the same event. The first-registered listener fires first.
- **Minimal Fix:** Document the FIFO behavior in the JSDoc for `on()`.
- **Risk of Fixing:** None.

---

### L-03: MapEngine.floodFill() Uses String Keys for Visited Set

- **Severity:** LOW
- **Exact Location:** `js/mapEngine.js` (`floodFill` function)
- **Explanation:** The flood fill uses `visited.add(r + ',' + c)` string keys. For large fills, string concatenation and hashing are slower than a numeric index like `r * width + c`. For typical VTT maps (< 200×200), this is unlikely to matter.
- **Root Cause:** Simpler string-key approach chosen over numeric index.
- **Reproduction:** Flood-fill a very large open area (200×200). Mild performance difference vs. numeric indexing.
- **Minimal Fix:** Use `visited.add(r * mapState.width + c)` for marginal performance improvement.
- **Risk of Fixing:** Very low.

---

### L-04: Tile Cache in TileRenderer Has No Size Bound

- **Severity:** LOW
- **Exact Location:** `js/tileRenderer.js` (tile cache implementation)
- **Explanation:** TileRenderer caches rendered tile images for performance. The cache has no eviction policy or maximum size. For maps with many unique tile configurations (different types, rotations, variants), the cache grows without bound, potentially consuming significant memory over long sessions.
- **Root Cause:** Cache designed for performance without memory bounds.
- **Reproduction:** Repeatedly change tile types/variants across a large map over a long session. Memory usage grows monotonically.
- **Minimal Fix:** Add an LRU eviction policy or a maximum cache size (e.g., 500 entries).
- **Risk of Fixing:** Low.

---

### L-05: LightingSystem and AtmosphericEffects Operate Without Coordination

- **Severity:** LOW
- **Exact Location:** `js/lightingSystem.js` and `js/atmosphericEffects.js`
- **Explanation:** Both systems apply visual effects (fog, ambient light, particles) independently. LightingSystem has its own time-of-day, weather presets, bloom, vignette, and fog density. AtmosphericEffects has dust, fog wisps, light rays, magic particles. There is no shared state for weather/time-of-day between them, so a "night" lighting setting doesn't affect atmospheric dust visibility, and "rain" weather in one doesn't sync with the other.
- **Root Cause:** Independent development of visual effect systems.
- **Reproduction:** Set LightingSystem to "night" mode. AtmosphericEffects light rays still render as if daytime.
- **Minimal Fix:** Have both systems subscribe to shared weather/time-of-day events via EventBus.
- **Risk of Fixing:** Low.

---

### L-06: Character.js and Animation.js Use DOM-Based UI Separate from Canvas

- **Severity:** LOW
- **Exact Location:** `js/character.js` and `js/animation.js`
- **Explanation:** Character creation and animation use DOM manipulation (`document.getElementById`, jQuery-like patterns) while the map/token system is entirely Canvas-based. The animation system in `animation.js` animates DOM character elements that are separate from canvas-rendered tokens. This creates a disconnect — characters created in the character panel have no direct link to canvas tokens.
- **Root Cause:** DOM-based character system predates or was developed separately from the Canvas token system.
- **Reproduction:** Create a character via the character panel. It does not automatically appear as a token on the canvas map.
- **Minimal Fix:** This is an integration gap rather than a bug. Bridge them by having character creation emit an event that TokenSystem can listen for, or add a manual "Add to Map" button.
- **Risk of Fixing:** Low.

---

### L-07: FeedbackSystem Relies on CSS Animations Without Cleanup

- **Severity:** LOW
- **Exact Location:** `js/FeedbackSystem.js`
- **Explanation:** FeedbackSystem creates DOM elements for flash effects and damage numbers, then removes them after animation via `setTimeout`. If many feedback effects fire rapidly (e.g., AoE spell hitting 10+ tokens), multiple overlapping DOM elements are created. The `setTimeout` cleanup is reliable but creates temporary DOM bloat.
- **Root Cause:** Fire-and-forget DOM element creation pattern.
- **Reproduction:** Trigger rapid combat events (10+ hits in quick succession). DOM temporarily accumulates feedback elements.
- **Minimal Fix:** Pool feedback elements or limit concurrent active feedback elements.
- **Risk of Fixing:** Very low.

---

### L-08: Initiative Uses Math.random() Instead of Cryptographic Random

- **Severity:** LOW
- **Exact Location:** `js/combatSystem.js` (initiative rolling)
- **Explanation:** Initiative is rolled with `Math.floor(Math.random() * 20) + 1`. `Math.random()` is not cryptographically secure, but for a D&D VTT this is acceptable. The concern is that `Math.random()` can exhibit patterns in some engines. Similarly, `dice.js` uses `Math.random()` for all rolls.
- **Root Cause:** Standard JS random used for game mechanics.
- **Reproduction:** Not practically exploitable in a tabletop context.
- **Minimal Fix:** No fix needed for VTT use. If competitive fairness is desired, use `crypto.getRandomValues()`.
- **Risk of Fixing:** Very low.

---

## Summary Table

| ID   | Severity | Module(s)                    | Category                  |
|------|----------|------------------------------|---------------------------|
| C-01 | CRITICAL | index.html, GameState        | Runtime Error             |
| C-02 | CRITICAL | MapEngine, GameState         | State Inconsistency       |
| C-03 | CRITICAL | MapEngine, GameState         | Design Violation          |
| H-01 | HIGH     | RenderPipeline               | Logic Bug                 |
| H-02 | HIGH     | FogOfWar, map.js             | Broken Data Flow          |
| H-03 | HIGH     | EventBus, AudioHooks         | Silent Failure            |
| H-04 | HIGH     | PerformanceManager, Particles| Silent Failure            |
| H-05 | HIGH     | CombatSystem, map.js         | Improper Lifecycle        |
| M-01 | MEDIUM   | TokenSystem                  | Race Condition            |
| M-02 | MEDIUM   | TokenSystem                  | Performance Risk          |
| M-03 | MEDIUM   | map.js                       | Performance Risk          |
| M-04 | MEDIUM   | map.js, main.js, TimeManager | Design Violation          |
| M-05 | MEDIUM   | GameState                    | State Inconsistency       |
| M-06 | MEDIUM   | map.js, FogOfWar             | Performance Risk          |
| M-07 | MEDIUM   | MapEngine                    | Silent Failure            |
| M-08 | MEDIUM   | Multiple engine modules      | Dead Code / Scalability   |
| L-01 | LOW      | GameState                    | State Inconsistency       |
| L-02 | LOW      | EventBus                     | Design Violation          |
| L-03 | LOW      | MapEngine                    | Performance Risk          |
| L-04 | LOW      | TileRenderer                 | Memory / Scalability      |
| L-05 | LOW      | LightingSystem, Atmospheric  | Design Violation          |
| L-06 | LOW      | Character, Animation         | Broken Data Flow          |
| L-07 | LOW      | FeedbackSystem               | Memory / Performance      |
| L-08 | LOW      | CombatSystem, Dice           | Design Violation          |

---

## Recommended Fix Priority

1. **C-01** — Add GameState.js to index.html. Without this, the application is non-functional for all token and combat features. Trivial 1-line fix.
2. **H-01** — Fix camera shake dt calculation. Simple variable reordering.
3. **H-03** — Return unsubscribe function from EventBus.on(). 3-line fix.
4. **H-04** — Add setMaxParticles() to ParticleSystem. Small additive change.
5. **H-02** — Fix darkvision type handling in FogOfWar. Small type change.
6. **H-05** — Separate CombatSystem init from callback setter.
7. **C-02/C-03** — Unify tile state authority (larger architectural decision — plan carefully before executing).

---

*End of audit report.*
