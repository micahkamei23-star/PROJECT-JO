/**
 * renderPipeline.js – Rendering Pipeline
 *
 * Orchestrates ordered render passes (background → tiles → props → tokens →
 * fx → fog → ui), dirty-rect tracking, camera shake, post-processing
 * hooks, viewport culling, and performance statistics.
 *
 * @module RenderPipeline
 */

const RenderPipeline = (() => {
  'use strict';

  // ── State ───────────────────────────────────────────────────────────────

  /**
   * Render passes: name → { name, order, drawFn, enabled }.
   * @type {Map<string, Object>}
   */
  const _passes = new Map();

  /** Sorted pass array (rebuilt when passes change). */
  let _sortedPasses = [];
  let _sortDirty    = true;

  /** Dirty-rect tracking. */
  let _dirtyRects = [];
  let _allDirty   = true;

  /** Camera shake state. */
  let _shakeIntensity = 0;
  let _shakeDuration  = 0;
  let _shakeElapsed   = 0;
  let _shakeOffsetX   = 0;
  let _shakeOffsetY   = 0;

  /** Post-processing hooks: array of (ctx, viewState) functions. */
  const _postProcessHooks = [];

  /** Viewport for culling. */
  const _viewport = { x: 0, y: 0, w: 0, h: 0 };

  /** Performance stats. */
  const _stats = {
    drawCalls: 0,
    passTime:  {},
    fps:       0,
    frameTime: 0,
  };
  let _lastFrameTs = 0;
  let _fpsFrames   = 0;
  let _fpsTimer    = 0;

  // ── Helpers ─────────────────────────────────────────────────────────────

  function _rebuildSortedPasses() {
    if (!_sortDirty) return;
    _sortedPasses = Array.from(_passes.values()).sort((a, b) => a.order - b.order);
    _sortDirty = false;
  }

  // ── Default passes ──────────────────────────────────────────────────────

  /** Register the canonical render-pass ordering (no-op draw functions). */
  function _initDefaultPasses() {
    const defaults = [
      { name: 'background', order: 0  },
      { name: 'tiles',      order: 10 },
      { name: 'props',      order: 20 },
      { name: 'tokens',     order: 30 },
      { name: 'fx',         order: 40 },
      { name: 'fog',        order: 50 },
      { name: 'ui',         order: 60 },
    ];
    for (const d of defaults) {
      _passes.set(d.name, {
        name:    d.name,
        order:   d.order,
        drawFn:  null,   // no-op until overridden
        enabled: true,
      });
    }
    _sortDirty = true;
  }

  _initDefaultPasses();

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Add (or replace) a named render pass.
   * @param {string}   name   - Pass name.
   * @param {number}   order  - Sort order (lower = drawn first).
   * @param {Function} drawFn - (ctx, viewState) drawing callback.
   */
  function addPass(name, order, drawFn) {
    _passes.set(name, { name, order, drawFn, enabled: true });
    _sortDirty = true;
  }

  /**
   * Remove a render pass by name.
   * @param {string} name
   */
  function removePass(name) {
    _passes.delete(name);
    _sortDirty = true;
  }

  /**
   * Enable a render pass.
   * @param {string} name
   */
  function enablePass(name) {
    const p = _passes.get(name);
    if (p) p.enabled = true;
  }

  /**
   * Disable a render pass.
   * @param {string} name
   */
  function disablePass(name) {
    const p = _passes.get(name);
    if (p) p.enabled = false;
  }

  /**
   * Execute all enabled render passes in order.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} viewState - { offsetX, offsetY, scale, canvasWidth, canvasHeight }
   */
  function render(ctx, viewState) {
    if (!ctx) return;
    const frameStart = typeof performance !== 'undefined' ? performance.now() : Date.now();

    _rebuildSortedPasses();

    // FPS tracking
    const now = frameStart;
    if (_lastFrameTs > 0) {
      const dt = (now - _lastFrameTs) / 1000;
      _fpsTimer += dt;
      _fpsFrames++;
      if (_fpsTimer >= 1.0) {
        _stats.fps = _fpsFrames;
        _fpsFrames = 0;
        _fpsTimer -= 1.0;
      }
    }
    _lastFrameTs = now;

    // Update shake (duration is in seconds, timestamps are ms)
    if (_shakeDuration > 0) {
      const dt = _lastFrameTs > 0 ? (now - _lastFrameTs) / 1000 : 0;
      _shakeElapsed += dt;
      const progress = Math.min(_shakeElapsed / _shakeDuration, 1);
      const decay    = 1 - progress;
      _shakeOffsetX  = (Math.random() * 2 - 1) * _shakeIntensity * decay;
      _shakeOffsetY  = (Math.random() * 2 - 1) * _shakeIntensity * decay;
      if (progress >= 1) {
        _shakeDuration  = 0;
        _shakeIntensity = 0;
        _shakeOffsetX   = 0;
        _shakeOffsetY   = 0;
      }
    }

    const vs = viewState || {};
    const effectiveView = {
      offsetX:      (vs.offsetX || 0) + _shakeOffsetX,
      offsetY:      (vs.offsetY || 0) + _shakeOffsetY,
      scale:        vs.scale || 1,
      canvasWidth:  vs.canvasWidth  || (_viewport.w || 800),
      canvasHeight: vs.canvasHeight || (_viewport.h || 600),
    };

    _stats.drawCalls = 0;

    ctx.save();
    ctx.setTransform(
      effectiveView.scale, 0,
      0, effectiveView.scale,
      effectiveView.offsetX,
      effectiveView.offsetY
    );

    for (const pass of _sortedPasses) {
      if (!pass.enabled || typeof pass.drawFn !== 'function') continue;
      const passStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
      pass.drawFn(ctx, effectiveView);
      const passEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
      _stats.passTime[pass.name] = passEnd - passStart;
      _stats.drawCalls++;
    }

    ctx.restore();

    // Post-processing (runs in screen space)
    for (const hook of _postProcessHooks) {
      hook(ctx, effectiveView);
    }

    _allDirty = false;
    _dirtyRects.length = 0;

    const frameEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
    _stats.frameTime = frameEnd - frameStart;
  }

  // ── Dirty tracking ──────────────────────────────────────────────────────

  /**
   * Mark a rectangular region as needing redraw.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  function markDirty(x, y, w, h) {
    _dirtyRects.push({ x, y, w, h });
  }

  /** Mark the entire canvas as dirty. */
  function markAllDirty() {
    _allDirty = true;
  }

  /**
   * Check if any region needs redraw.
   * @returns {boolean}
   */
  function isDirty() {
    return _allDirty || _dirtyRects.length > 0;
  }

  // ── Camera shake ────────────────────────────────────────────────────────

  /**
   * Apply a screen-shake effect.
   * @param {number} intensity - Pixel offset magnitude.
   * @param {number} duration  - Duration in seconds.
   */
  function shake(intensity, duration) {
    _shakeIntensity = intensity || 5;
    _shakeDuration  = duration  || 0.3;
    _shakeElapsed   = 0;
  }

  // ── Post-processing ─────────────────────────────────────────────────────

  /**
   * Register a post-processing hook. Common examples: vignette, color grading.
   * @param {Function} fn - (ctx, viewState) => void
   */
  function addPostProcess(fn) {
    if (typeof fn === 'function') _postProcessHooks.push(fn);
  }

  /**
   * Remove a post-processing hook.
   * @param {Function} fn
   */
  function removePostProcess(fn) {
    const idx = _postProcessHooks.indexOf(fn);
    if (idx !== -1) _postProcessHooks.splice(idx, 1);
  }

  /**
   * Built-in vignette post-process effect.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} viewState
   */
  function vignetteEffect(ctx, viewState) {
    const w  = viewState.canvasWidth;
    const h  = viewState.canvasHeight;
    const cx = w / 2;
    const cy = h / 2;
    const r  = Math.max(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * Built-in color grading (sepia tone) post-process effect.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} viewState
   */
  function colorGradeEffect(ctx, viewState) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = 'rgba(112,66,20,0.1)';
    ctx.fillRect(0, 0, viewState.canvasWidth, viewState.canvasHeight);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // ── Viewport / culling ──────────────────────────────────────────────────

  /**
   * Set the viewport for culling.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  function setViewport(x, y, w, h) {
    _viewport.x = x;
    _viewport.y = y;
    _viewport.w = w;
    _viewport.h = h;
  }

  /**
   * Get the current viewport.
   * @returns {{ x: number, y: number, w: number, h: number }}
   */
  function getViewport() {
    return { x: _viewport.x, y: _viewport.y, w: _viewport.w, h: _viewport.h };
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  /**
   * Return current performance statistics.
   * @returns {{ drawCalls: number, passTime: Object, fps: number, frameTime: number }}
   */
  function getStats() {
    return {
      drawCalls: _stats.drawCalls,
      passTime:  Object.assign({}, _stats.passTime),
      fps:       _stats.fps,
      frameTime: _stats.frameTime,
    };
  }

  /**
   * Reset all passes to defaults and clear state.
   */
  function clear() {
    _passes.clear();
    _sortedPasses = [];
    _sortDirty    = true;
    _dirtyRects.length = 0;
    _allDirty   = true;
    _postProcessHooks.length = 0;
    _shakeIntensity = 0;
    _shakeDuration  = 0;
    _initDefaultPasses();
  }

  return {
    addPass,
    removePass,
    enablePass,
    disablePass,
    render,
    markDirty,
    markAllDirty,
    isDirty,
    shake,
    addPostProcess,
    removePostProcess,
    vignetteEffect,
    colorGradeEffect,
    setViewport,
    getViewport,
    getStats,
    clear,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RenderPipeline;
}
