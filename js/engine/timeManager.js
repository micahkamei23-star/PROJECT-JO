/**
 * timeManager.js – Time & Animation Manager
 *
 * Controls the main game loop, delta-time calculation, tweening,
 * delayed timers, and per-frame callbacks. Includes built-in easing
 * functions and frame-budget monitoring.
 *
 * @module TimeManager
 */

const TimeManager = (() => {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────

  /** Target frame time at 60 FPS (ms). */
  const FRAME_BUDGET_MS = 16.67;

  // ── State ───────────────────────────────────────────────────────────────

  let _running    = false;
  let _rafId      = null;
  let _lastTime   = 0;
  let _elapsed    = 0;
  let _deltaTime  = 0;
  let _fps        = 0;
  let _frameCount = 0;
  let _fpsTimer   = 0;

  /** Per-frame callbacks. */
  const _tickCallbacks = [];

  /** Active tweens: id → tween data. */
  const _tweens = new Map();
  let _nextTweenId = 1;

  /** Active timers: id → timer data. */
  const _timers = new Map();
  let _nextTimerId = 1;

  // ── Easing functions ────────────────────────────────────────────────────

  /** @type {Object<string, (t: number) => number>} */
  const easing = {
    linear(t)        { return t; },
    easeInOut(t)     { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    easeOutCubic(t)  { const t1 = t - 1; return t1 * t1 * t1 + 1; },
    easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    easeOutBack(t)   { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    easeOutElastic(t) {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
    },
  };

  // ── Main loop ───────────────────────────────────────────────────────────

  /**
   * Internal RAF callback.
   * @param {number} timestamp - High-resolution timestamp from requestAnimationFrame.
   */
  function _loop(timestamp) {
    if (!_running) return;

    _deltaTime = Math.min((timestamp - _lastTime) / 1000, 0.1); // cap at 100ms
    _lastTime  = timestamp;
    _elapsed  += _deltaTime;

    // FPS tracking
    _frameCount++;
    _fpsTimer += _deltaTime;
    if (_fpsTimer >= 1.0) {
      _fps        = _frameCount;
      _frameCount = 0;
      _fpsTimer  -= 1.0;
    }

    const frameStart = performance.now();

    // Update tweens
    _updateTweens(_deltaTime);

    // Update timers
    _updateTimers(_deltaTime);

    // Per-frame callbacks
    for (let i = 0; i < _tickCallbacks.length; i++) {
      _tickCallbacks[i](_deltaTime);
    }

    // Frame budget warning
    const frameTime = performance.now() - frameStart;
    if (frameTime > FRAME_BUDGET_MS) {
      // eslint-disable-next-line no-console
      console.warn(`[TimeManager] Frame over budget: ${frameTime.toFixed(2)}ms (budget: ${FRAME_BUDGET_MS}ms)`);
    }

    _rafId = requestAnimationFrame(_loop);
  }

  // ── Tween engine ────────────────────────────────────────────────────────

  /**
   * Update all active tweens.
   * @param {number} dt
   */
  function _updateTweens(dt) {
    for (const [id, tw] of _tweens) {
      tw.time += dt;
      const progress = Math.min(tw.time / tw.duration, 1);
      const easedT = tw.easeFn(progress);

      for (const prop of Object.keys(tw.from)) {
        tw.target[prop] = tw.from[prop] + (tw.to[prop] - tw.from[prop]) * easedT;
      }

      if (progress >= 1) {
        _tweens.delete(id);
        if (tw.onComplete) tw.onComplete();
      }
    }
  }

  // ── Timer engine ────────────────────────────────────────────────────────

  /**
   * Update all active timers.
   * @param {number} dt
   */
  function _updateTimers(dt) {
    for (const [id, timer] of _timers) {
      timer.accumulated += dt;
      if (timer.accumulated >= timer.delay) {
        timer.callback();
        if (timer.repeat) {
          timer.accumulated -= timer.delay;
        } else {
          _timers.delete(id);
        }
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Start the main loop. */
  function start() {
    if (_running) return;
    _running  = true;
    _lastTime = performance.now();
    _rafId    = requestAnimationFrame(_loop);
  }

  /** Stop the main loop. */
  function stop() {
    _running = false;
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
  }

  /** @returns {number} Delta time in seconds since last frame. */
  function getDeltaTime() { return _deltaTime; }

  /** @returns {number} Total elapsed time in seconds since start. */
  function getElapsed() { return _elapsed; }

  /** @returns {number} Current frames per second. */
  function getFPS() { return _fps; }

  /**
   * Animate properties on a target object over time.
   * @param {Object} target - Object whose properties will be animated.
   * @param {Object} props - Target property values, e.g. { x: 100, y: 200 }.
   * @param {number} duration - Duration in seconds.
   * @param {string|Function} [easingFn='linear'] - Easing name or function.
   * @param {Function} [onComplete] - Called when tween finishes.
   * @returns {number} Tween ID for later cancellation.
   */
  function addTween(target, props, duration, easingFn, onComplete) {
    const id = _nextTweenId++;
    const easeFn = typeof easingFn === 'function'
      ? easingFn
      : (easing[easingFn] || easing.linear);

    const from = {};
    const to   = {};
    for (const key of Object.keys(props)) {
      from[key] = target[key] !== undefined ? target[key] : 0;
      to[key]   = props[key];
    }

    _tweens.set(id, {
      target,
      from,
      to,
      duration: Math.max(duration, 0.001),
      easeFn,
      time: 0,
      onComplete: onComplete || null,
    });
    return id;
  }

  /**
   * Cancel an active tween.
   * @param {number} id
   */
  function removeTween(id) {
    _tweens.delete(id);
  }

  /**
   * Schedule a delayed callback.
   * @param {number} delay - Delay in seconds.
   * @param {Function} callback
   * @param {boolean} [repeat=false] - If true, the timer repeats.
   * @returns {number} Timer ID for later cancellation.
   */
  function addTimer(delay, callback, repeat) {
    const id = _nextTimerId++;
    _timers.set(id, {
      delay: Math.max(delay, 0.001),
      callback,
      repeat: !!repeat,
      accumulated: 0,
    });
    return id;
  }

  /**
   * Cancel an active timer.
   * @param {number} id
   */
  function removeTimer(id) {
    _timers.delete(id);
  }

  /**
   * Register a per-frame tick callback.
   * @param {Function} callback - Receives (dt).
   */
  function onTick(callback) {
    if (typeof callback === 'function') {
      _tickCallbacks.push(callback);
    }
  }

  /**
   * Unregister a per-frame tick callback.
   * @param {Function} callback
   */
  function offTick(callback) {
    const idx = _tickCallbacks.indexOf(callback);
    if (idx !== -1) _tickCallbacks.splice(idx, 1);
  }

  /**
   * Reset all internal state (useful for tests).
   */
  function reset() {
    stop();
    _elapsed    = 0;
    _deltaTime  = 0;
    _fps        = 0;
    _frameCount = 0;
    _fpsTimer   = 0;
    _tickCallbacks.length = 0;
    _tweens.clear();
    _timers.clear();
  }

  return {
    easing,
    start,
    stop,
    getDeltaTime,
    getElapsed,
    getFPS,
    addTween,
    removeTween,
    addTimer,
    removeTimer,
    onTick,
    offTick,
    reset,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimeManager;
}
