/**
 * particleSystem.js – Particle System
 *
 * High-performance particle engine with emitter management, particle pooling,
 * built-in effect presets (fire, smoke, sparks, magic, heal, hit, aura),
 * and burst / timed-effect helpers.
 *
 * @module ParticleSystem
 */

const ParticleSystem = (() => {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────

  /** Global maximum particle budget across all emitters. */
  const MAX_PARTICLES = 5000;

  // ── Object pool ─────────────────────────────────────────────────────────

  const _pool = [];

  function _allocParticle() {
    if (_pool.length > 0) return _pool.pop();
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1,
      size: 1, sizeEnd: 0,
      r: 255, g: 255, b: 255, a: 1,
      rEnd: 255, gEnd: 255, bEnd: 255, aEnd: 0,
      gravity: 0, drag: 0, blendMode: 'lighter',
      active: false, emitterId: 0,
    };
  }

  function _freeParticle(p) {
    p.active = false;
    _pool.push(p);
  }

  // ── State ───────────────────────────────────────────────────────────────

  /** emitterId → emitter */
  const _emitters = new Map();
  let _nextEmitterId = 1;

  /** All live particles (flat array for cache-friendly iteration). */
  let _particles = [];

  // ── Helpers ─────────────────────────────────────────────────────────────

  function _rand(min, max)  { return min + Math.random() * (max - min); }
  function _lerp(a, b, t)   { return a + (b - a) * t; }

  function _parseColor(c) {
    if (Array.isArray(c) && c.length >= 3) {
      return { r: c[0], g: c[1], b: c[2], a: c[3] !== undefined ? c[3] : 1 };
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  // ── Emitter logic ───────────────────────────────────────────────────────

  /**
   * Spawn a single particle from the given emitter config.
   * @param {Object} em
   */
  function _spawnParticle(em) {
    if (_particles.length >= MAX_PARTICLES) return;

    const p = _allocParticle();
    p.active = true;
    p.emitterId = em.id || 0;

    p.x = em.x + _rand(-em.spawnRadius, em.spawnRadius);
    p.y = em.y + _rand(-em.spawnRadius, em.spawnRadius);

    const angle = em.direction + _rand(-em.spread / 2, em.spread / 2);
    const speed = _rand(em.speedMin, em.speedMax);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;

    p.life    = 0;
    p.maxLife = _rand(em.lifeMin, em.lifeMax);
    p.size    = _rand(em.sizeMin, em.sizeMax);
    p.sizeEnd = em.sizeEnd !== undefined ? em.sizeEnd : 0;

    const cs = em.colorStart;
    const ce = em.colorEnd;
    p.r = cs.r; p.g = cs.g; p.b = cs.b; p.a = cs.a;
    p.rEnd = ce.r; p.gEnd = ce.g; p.bEnd = ce.b; p.aEnd = ce.a;

    p.gravity   = em.gravity;
    p.drag      = em.drag;
    p.blendMode = em.blendMode;

    _particles.push(p);
  }

  // ── Presets ─────────────────────────────────────────────────────────────

  /** @type {Object<string, Object>} */
  const PRESETS = {
    fire: {
      rate: 40, maxParticles: 200, spawnRadius: 4,
      lifeMin: 0.3, lifeMax: 0.8,
      speedMin: 30, speedMax: 80, direction: -Math.PI / 2, spread: 0.6,
      sizeMin: 4, sizeMax: 8, sizeEnd: 0,
      colorStart: [255, 180, 50, 1], colorEnd: [255, 60, 10, 0],
      gravity: -40, drag: 0.98, blendMode: 'lighter',
    },
    smoke: {
      rate: 15, maxParticles: 120, spawnRadius: 6,
      lifeMin: 0.8, lifeMax: 2.0,
      speedMin: 10, speedMax: 30, direction: -Math.PI / 2, spread: 0.8,
      sizeMin: 6, sizeMax: 14, sizeEnd: 20,
      colorStart: [120, 120, 120, 0.5], colorEnd: [80, 80, 80, 0],
      gravity: -10, drag: 0.96, blendMode: 'source-over',
    },
    sparks: {
      rate: 60, maxParticles: 150, spawnRadius: 2,
      lifeMin: 0.15, lifeMax: 0.5,
      speedMin: 80, speedMax: 200, direction: 0, spread: Math.PI * 2,
      sizeMin: 1, sizeMax: 3, sizeEnd: 0,
      colorStart: [255, 240, 150, 1], colorEnd: [255, 120, 30, 0],
      gravity: 120, drag: 0.95, blendMode: 'lighter',
    },
    magic: {
      rate: 30, maxParticles: 180, spawnRadius: 8,
      lifeMin: 0.5, lifeMax: 1.2,
      speedMin: 15, speedMax: 50, direction: -Math.PI / 2, spread: Math.PI * 2,
      sizeMin: 2, sizeMax: 6, sizeEnd: 0,
      colorStart: [100, 150, 255, 1], colorEnd: [200, 100, 255, 0],
      gravity: -15, drag: 0.97, blendMode: 'lighter',
    },
    heal: {
      rate: 20, maxParticles: 100, spawnRadius: 12,
      lifeMin: 0.6, lifeMax: 1.5,
      speedMin: 15, speedMax: 40, direction: -Math.PI / 2, spread: 0.5,
      sizeMin: 3, sizeMax: 6, sizeEnd: 0,
      colorStart: [80, 255, 120, 0.9], colorEnd: [180, 255, 200, 0],
      gravity: -20, drag: 0.98, blendMode: 'lighter',
    },
    hit: {
      rate: 0, maxParticles: 80, spawnRadius: 2,
      lifeMin: 0.1, lifeMax: 0.35,
      speedMin: 100, speedMax: 250, direction: 0, spread: Math.PI * 2,
      sizeMin: 2, sizeMax: 5, sizeEnd: 0,
      colorStart: [255, 50, 30, 1], colorEnd: [255, 200, 100, 0],
      gravity: 60, drag: 0.92, blendMode: 'lighter',
    },
    aura: {
      rate: 25, maxParticles: 160, spawnRadius: 16,
      lifeMin: 0.8, lifeMax: 1.8,
      speedMin: 5, speedMax: 20, direction: -Math.PI / 2, spread: Math.PI * 2,
      sizeMin: 2, sizeMax: 5, sizeEnd: 1,
      colorStart: [200, 200, 255, 0.6], colorEnd: [150, 150, 255, 0],
      gravity: -5, drag: 0.99, blendMode: 'lighter',
    },
  };

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Create a new particle emitter.
   * @param {Object} config - Emitter configuration (see PRESETS for examples).
   * @returns {number} Emitter ID.
   */
  function createEmitter(config) {
    const c  = config || {};
    const cs = _parseColor(c.colorStart || [255, 255, 255, 1]);
    const ce = _parseColor(c.colorEnd   || [255, 255, 255, 0]);
    const id = _nextEmitterId++;

    _emitters.set(id, {
      id,
      x:            c.x || 0,
      y:            c.y || 0,
      rate:         c.rate != null         ? c.rate         : 20,
      maxParticles: c.maxParticles != null ? c.maxParticles : 200,
      spawnRadius:  c.spawnRadius  != null ? c.spawnRadius  : 0,
      lifeMin:      c.lifeMin != null      ? c.lifeMin      : 0.5,
      lifeMax:      c.lifeMax != null      ? c.lifeMax      : 1.5,
      speedMin:     c.speedMin != null     ? c.speedMin     : 20,
      speedMax:     c.speedMax != null     ? c.speedMax     : 60,
      direction:    c.direction != null    ? c.direction    : 0,
      spread:       c.spread != null       ? c.spread       : Math.PI * 2,
      sizeMin:      c.sizeMin != null      ? c.sizeMin      : 2,
      sizeMax:      c.sizeMax != null      ? c.sizeMax      : 6,
      sizeEnd:      c.sizeEnd != null      ? c.sizeEnd      : 0,
      colorStart:   cs,
      colorEnd:     ce,
      gravity:      c.gravity != null      ? c.gravity      : 0,
      drag:         c.drag != null         ? c.drag         : 1,
      blendMode:    c.blendMode || 'lighter',
      _accumulator: 0,
      _count:       0,
      active:       true,
      duration:     c.duration != null     ? c.duration     : -1, // -1 = infinite
      _elapsed:     0,
    });
    return id;
  }

  /**
   * Remove an emitter and its remaining particles.
   * @param {number} id
   */
  function removeEmitter(id) {
    _emitters.delete(id);
  }

  /**
   * Update all emitters and particles.
   * @param {number} dt - Delta time in seconds.
   */
  function update(dt) {
    // Spawn new particles from active emitters
    for (const em of _emitters.values()) {
      if (!em.active) continue;

      // Duration tracking
      if (em.duration > 0) {
        em._elapsed += dt;
        if (em._elapsed >= em.duration) {
          em.active = false;
          continue;
        }
      }

      if (em.rate > 0) {
        em._accumulator += dt;
        const interval = 1.0 / em.rate;
        while (em._accumulator >= interval && em._count < em.maxParticles) {
          _spawnParticle(em);
          em._count++;
          em._accumulator -= interval;
        }
      }
    }

    // Update live particles
    let writeIdx = 0;
    for (let i = 0; i < _particles.length; i++) {
      const p = _particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        // Return to owning emitter's count
        const owner = _emitters.get(p.emitterId);
        if (owner && owner._count > 0) owner._count--;
        _freeParticle(p);
        continue;
      }
      // Physics
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      _particles[writeIdx++] = p;
    }
    _particles.length = writeIdx;

    // Clean up finished emitters with no remaining particles
    for (const [id, em] of _emitters) {
      if (!em.active && em._count <= 0) {
        _emitters.delete(id);
      }
    }
  }

  /**
   * Draw all live particles to a canvas context.
   * @param {CanvasRenderingContext2D} ctx
   */
  function draw(ctx) {
    if (!ctx) return;
    ctx.save();
    for (let i = 0; i < _particles.length; i++) {
      const p = _particles[i];
      const t = p.life / p.maxLife;

      const r = Math.round(_lerp(p.r, p.rEnd, t));
      const g = Math.round(_lerp(p.g, p.gEnd, t));
      const b = Math.round(_lerp(p.b, p.bEnd, t));
      const a = _lerp(p.a, p.aEnd, t);
      const size = _lerp(p.size, p.sizeEnd, t);

      ctx.globalCompositeOperation = p.blendMode;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Spawn a one-shot burst of particles at a position.
   * @param {string} preset - Preset name (e.g. 'fire', 'hit').
   * @param {number} x
   * @param {number} y
   * @param {number} [count=20]
   */
  function spawnBurst(preset, x, y, count) {
    const base = PRESETS[preset] || PRESETS.sparks;
    count = count || 20;
    const cs = _parseColor(base.colorStart);
    const ce = _parseColor(base.colorEnd);

    const tempEm = {
      x, y,
      spawnRadius: base.spawnRadius || 0,
      lifeMin: base.lifeMin, lifeMax: base.lifeMax,
      speedMin: base.speedMin, speedMax: base.speedMax,
      direction: base.direction, spread: base.spread,
      sizeMin: base.sizeMin, sizeMax: base.sizeMax,
      sizeEnd: base.sizeEnd,
      colorStart: cs, colorEnd: ce,
      gravity: base.gravity, drag: base.drag,
      blendMode: base.blendMode,
    };

    for (let i = 0; i < count && _particles.length < MAX_PARTICLES; i++) {
      _spawnParticle(tempEm);
    }
  }

  /**
   * Spawn a timed effect that emits particles for a duration.
   * @param {string} preset - Preset name.
   * @param {number} x
   * @param {number} y
   * @param {number} duration - Duration in seconds.
   * @returns {number} Emitter ID.
   */
  function spawnEffect(preset, x, y, duration) {
    const base = PRESETS[preset] || PRESETS.magic;
    const cfg  = Object.assign({}, base, { x, y, duration: duration || 1 });
    return createEmitter(cfg);
  }

  /**
   * Get a preset config by name (for inspection or customisation).
   * @param {string} name
   * @returns {Object|undefined}
   */
  function getPreset(name) {
    return PRESETS[name] ? Object.assign({}, PRESETS[name]) : undefined;
  }

  /**
   * Current number of live particles.
   * @returns {number}
   */
  function particleCount() {
    return _particles.length;
  }

  /**
   * Remove all emitters and particles.
   */
  function clear() {
    for (const p of _particles) _freeParticle(p);
    _particles = [];
    _emitters.clear();
  }

  return {
    MAX_PARTICLES,
    PRESETS,
    createEmitter,
    removeEmitter,
    update,
    draw,
    spawnBurst,
    spawnEffect,
    getPreset,
    particleCount,
    clear,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticleSystem;
}
