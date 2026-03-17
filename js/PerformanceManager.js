/**
 * PerformanceManager.js – Performance Monitoring & Adaptive Quality
 *
 * Tracks frame rate and frame time using the render loop. When sustained
 * performance drops are detected, it dynamically reduces visual load:
 *   – particle budget (via ParticleSystem)
 *   – lighting effect complexity (via LightingSystem)
 *   – CSS animation load (via prefers-reduced-motion override class)
 *
 * Design rules:
 *   – Does NOT change core rendering logic
 *   – Does NOT remove features; effects are restored when perf recovers
 *   – Integrates with existing render loop via update(dt) call
 *   – Exposes getStats() for the Engine Stats panel
 *
 * Quality levels (highest → lowest):
 *   3 – HIGH   : full effects (default)
 *   2 – MEDIUM : halved particle budget, simplified lighting
 *   1 – LOW    : minimal particles, lighting disabled
 *
 * @module PerformanceManager
 */

const PerformanceManager = (() => {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────

  /** FPS thresholds that trigger quality changes. */
  const THRESHOLD_DROP   = 28;   // fps below this → reduce quality
  const THRESHOLD_RECOVER = 50;  // fps above this → consider restoring quality

  /** How many consecutive seconds below/above threshold before acting. */
  const SECONDS_BEFORE_DROP    = 2.0;
  const SECONDS_BEFORE_RECOVER = 4.0;

  /** Particle budgets per quality level. */
  const PARTICLE_BUDGETS = { 3: 1000, 2: 400, 1: 80 };

  /** Lighting quality flags per level. */
  const LIGHTING_ENABLED = { 3: true, 2: true, 1: false };

  // ── State ─────────────────────────────────────────────────────────────────

  let _quality     = 3;       // current quality level
  let _fps         = 60;      // smoothed FPS estimate
  let _frameTime   = 0;       // last frame time (ms)
  let _dropTimer   = 0;       // accumulated seconds below threshold
  let _recoverTimer = 0;      // accumulated seconds above threshold
  let _enabled     = true;    // master switch

  // Running average
  let _frameCount  = 0;
  let _fpsAccum    = 0;
  let _fpsSmoothed = 60;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _applyQuality(level) {
    if (level === _quality) return;
    const prev = _quality;
    _quality = level;

    // ── ParticleSystem budget ───────────────────────────────────────────────
    if (typeof ParticleSystem !== 'undefined' &&
        typeof ParticleSystem.setMaxParticles === 'function') {
      ParticleSystem.setMaxParticles(PARTICLE_BUDGETS[level]);
    }

    // ── LightingSystem ──────────────────────────────────────────────────────
    if (typeof LightingSystem !== 'undefined') {
      const enable = LIGHTING_ENABLED[level];
      if (typeof LightingSystem.setEnabled === 'function') {
        LightingSystem.setEnabled(enable);
      } else if (typeof LightingSystem.enable === 'function' && enable) {
        LightingSystem.enable();
      } else if (typeof LightingSystem.disable === 'function' && !enable) {
        LightingSystem.disable();
      }
    }

    // ── CSS animation load ──────────────────────────────────────────────────
    // Add/remove a body class so we can target expensive CSS animations
    document.body.classList.toggle('perf-reduced', level < 3);
    document.body.classList.toggle('perf-low',     level < 2);

    // Emit on EventBus if available
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('perf:qualityChange', { from: prev, to: level });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Call once per frame from the render loop (or main.js DOMContentLoaded).
   * @param {number} dt - Delta time in seconds since last frame.
   */
  function update(dt) {
    if (!_enabled || dt <= 0) return;

    _frameTime = dt * 1000;

    // Running FPS average over ~30 frames
    _fpsAccum  += 1 / dt;
    _frameCount++;
    if (_frameCount >= 30) {
      _fpsSmoothed = _fpsAccum / _frameCount;
      _fps         = _fpsSmoothed;
      _fpsAccum    = 0;
      _frameCount  = 0;
    }

    if (_fps < THRESHOLD_DROP) {
      _dropTimer    += dt;
      _recoverTimer  = 0;
    } else if (_fps > THRESHOLD_RECOVER) {
      _recoverTimer += dt;
      _dropTimer     = 0;
    } else {
      _dropTimer    = 0;
      _recoverTimer = 0;
    }

    // Decide whether to change quality
    if (_dropTimer >= SECONDS_BEFORE_DROP && _quality > 1) {
      _applyQuality(_quality - 1);
      _dropTimer = 0;
    } else if (_recoverTimer >= SECONDS_BEFORE_RECOVER && _quality < 3) {
      _applyQuality(_quality + 1);
      _recoverTimer = 0;
    }
  }

  /**
   * Return current performance statistics.
   * @returns {{ fps: number, frameTime: number, quality: number }}
   */
  function getStats() {
    return {
      fps:       Math.round(_fps),
      frameTime: Math.round(_frameTime * 10) / 10,
      quality:   _quality,
    };
  }

  /**
   * Force a specific quality level (bypasses adaptive logic temporarily).
   * @param {number} level - 1, 2, or 3
   */
  function setQuality(level) {
    const clamped = Math.max(1, Math.min(3, level));
    _dropTimer    = 0;
    _recoverTimer = 0;
    _applyQuality(clamped);
  }

  /**
   * Enable or disable adaptive quality management.
   * @param {boolean} flag
   */
  function setEnabled(flag) {
    _enabled = !!flag;
  }

  /**
   * Initialise the PerformanceManager and hook into the render loop if
   * RenderPipeline is available, otherwise rely on external update() calls.
   */
  function init() {
    // Inject minimal CSS for reduced-motion overrides
    if (!document.getElementById('perf-manager-styles')) {
      const style = document.createElement('style');
      style.id = 'perf-manager-styles';
      style.textContent = `
/* PerformanceManager – reduce expensive CSS animations on low-end frames */
.perf-reduced .rune-border::before,
.perf-reduced .rune-border::after,
.perf-reduced .magic-divider-icon,
.perf-reduced .atmospheric-canvas {
  animation-duration: 20s !important;
}
.perf-low .atmospheric-canvas { display: none !important; }
.perf-low .stage-token { animation: none !important; }
.perf-low .tool-btn.active,
.perf-low .tile-btn.selected { animation: none !important; }
`;
      document.head.appendChild(style);
    }

    // If RenderPipeline exposes getStats, we can read FPS from it instead
    // of maintaining a separate counter — but update() still handles logic.
    _quality = 3;
    _dropTimer = 0;
    _recoverTimer = 0;
  }

  // ── Module exports ────────────────────────────────────────────────────────

  return {
    init,
    update,
    getStats,
    setQuality,
    setEnabled,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PerformanceManager;
}
