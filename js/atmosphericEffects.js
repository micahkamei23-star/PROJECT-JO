/**
 * atmosphericEffects.js – Atmospheric Effects Overlay
 * Manages dust particles, fog wisps, light rays, magic particles,
 * and ambient shimmer for the PROJECT-JO D&D VTT canvas renderer.
 */

const AtmosphericEffects = (() => {
  'use strict';

  // ── Private State ──────────────────────────────────────────────────────────

  let _canvasW = 800;
  let _canvasH = 600;

  // Dust
  let _dustParticles  = [];
  const DUST_MAX      = 100;

  // Fog wisps
  let _fogWisps       = [];
  let _fogDensity     = 0.3;
  const WISP_MAX      = 20;

  // Light rays
  let _lightRays      = [];
  let _raysEnabled    = false;
  let _rayColor       = '#fffbe8';
  const RAY_COUNT     = 6;

  // Magic particles
  let _magicParticles = [];
  const MAGIC_MAX     = 300;

  // Shimmer
  let _shimmerEnabled = false;
  let _shimmerPhase   = 0;

  // Internal time accumulator
  let _time = 0;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function _randInt(min, max) {
    return Math.floor(_rand(min, max + 1));
  }

  function _hexToRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3
      ? h.split('').map(c => c + c).join('')
      : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  // ── Dust Particles ─────────────────────────────────────────────────────────

  function _createDustParticle(region) {
    const r = region || { x: 0, y: 0, w: _canvasW, h: _canvasH };
    return {
      x:    _rand(r.x, r.x + r.w),
      y:    _rand(r.y + r.h * 0.3, r.y + r.h), // spawn in lower 70%
      vx:   _rand(-0.15, 0.15),
      vy:   _rand(-0.30, -0.05), // gentle upward drift
      size: _rand(0.8, 2.5),
      alpha: _rand(0.1, 0.4),
      life: _rand(4, 12), // seconds
      maxLife: 0,
      wiggle: _rand(0, Math.PI * 2),
      wiggleSpeed: _rand(0.5, 1.5),
    };
  }

  /**
   * Populate dust particles for the given canvas region.
   * @param {number} count
   * @param {{ x, y, w, h }} [region]
   */
  function spawnDust(count, region) {
    const n = Math.min(count, DUST_MAX - _dustParticles.length);
    for (let i = 0; i < n; i++) {
      const p = _createDustParticle(region);
      p.maxLife = p.life;
      _dustParticles.push(p);
    }
  }

  function _updateDust(dt) {
    for (let i = _dustParticles.length - 1; i >= 0; i--) {
      const p = _dustParticles[i];
      p.wiggle += p.wiggleSpeed * dt;
      p.x      += p.vx + Math.sin(p.wiggle) * 0.3;
      p.y      += p.vy;
      p.life   -= dt;

      if (p.life <= 0 || p.y < -10 || p.x < -10 || p.x > _canvasW + 10) {
        _dustParticles.splice(i, 1);
      }
    }

    // Respawn if below max
    while (_dustParticles.length < DUST_MAX) {
      const p = _createDustParticle();
      p.maxLife = p.life;
      _dustParticles.push(p);
    }
  }

  function _renderDust(ctx) {
    ctx.save();
    for (const p of _dustParticles) {
      const lifeRatio = p.maxLife > 0 ? Math.min(p.life / p.maxLife, 1) : 1;
      const fadeAlpha = lifeRatio < 0.2 ? lifeRatio / 0.2 : 1;
      ctx.globalAlpha = p.alpha * fadeAlpha;
      ctx.fillStyle   = '#e8dcc8';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Fog Wisps ──────────────────────────────────────────────────────────────

  function _createFogWisp() {
    const startRight = Math.random() > 0.5;
    return {
      x:      startRight ? _canvasW + 100 : -300,
      y:      _rand(_canvasH * 0.45, _canvasH * 0.95),
      width:  _rand(180, 380),
      height: _rand(40, 90),
      alpha:  _rand(0.03, 0.12) * _fogDensity,
      vx:     startRight ? _rand(-0.3, -0.1) : _rand(0.1, 0.3),
      drift:  _rand(0, Math.PI * 2),
      driftSpeed: _rand(0.1, 0.3),
    };
  }

  /**
   * Set fog density (0–1). Higher values spawn more wisps.
   * @param {number} level
   */
  function setFogDensity(level) {
    _fogDensity = Math.max(0, Math.min(1, level));
    // Trim excess wisps if density was lowered
    const target = Math.ceil(_fogDensity * WISP_MAX);
    if (_fogWisps.length > target) {
      _fogWisps.splice(target);
    }
  }

  function _updateFogWisps(dt) {
    const target = Math.ceil(_fogDensity * WISP_MAX);

    for (let i = _fogWisps.length - 1; i >= 0; i--) {
      const w = _fogWisps[i];
      w.drift += w.driftSpeed * dt;
      w.x     += w.vx + Math.sin(w.drift) * 0.2;
      w.y     += Math.cos(w.drift * 0.7)  * 0.1;

      if (w.x < -(w.width + 50) || w.x > _canvasW + w.width + 50) {
        _fogWisps.splice(i, 1);
      }
    }

    while (_fogWisps.length < target) {
      _fogWisps.push(_createFogWisp());
    }
  }

  function _renderFogWisps(ctx) {
    if (_fogDensity <= 0) return;
    ctx.save();
    for (const w of _fogWisps) {
      const grad = ctx.createRadialGradient(
        w.x, w.y, 0,
        w.x, w.y, Math.max(w.width, w.height) * 0.6
      );
      grad.addColorStop(0,   `rgba(200,210,220,${w.alpha})`);
      grad.addColorStop(0.6, `rgba(200,210,220,${w.alpha * 0.4})`);
      grad.addColorStop(1,   'rgba(200,210,220,0)');

      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.scale(w.width / (Math.max(w.width, w.height) * 1.2), w.height / (Math.max(w.width, w.height) * 1.2));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(w.width, w.height) * 0.6, Math.max(w.width, w.height) * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // ── Light Rays ─────────────────────────────────────────────────────────────

  function _createLightRay(index) {
    const spread = _canvasW * 0.8;
    return {
      x:      _canvasW * 0.1 + (spread / RAY_COUNT) * index + _rand(-20, 20),
      angle:  _rand(-0.08, 0.08),
      width:  _rand(25, 65),
      length: _canvasH * _rand(0.6, 0.9),
      alpha:  _rand(0.03, 0.08),
      speed:  _rand(-0.3, 0.3),
      phase:  _rand(0, Math.PI * 2),
    };
  }

  /**
   * Enable or disable light ray rendering.
   * @param {boolean} bool
   */
  function enableLightRays(bool) {
    _raysEnabled = !!bool;
    if (_raysEnabled && _lightRays.length === 0) {
      for (let i = 0; i < RAY_COUNT; i++) {
        _lightRays.push(_createLightRay(i));
      }
    }
  }

  /**
   * Set the color used for light rays.
   * @param {string} cssColor
   */
  function setLightRayColor(cssColor) {
    _rayColor = cssColor;
  }

  function _updateLightRays(dt) {
    if (!_raysEnabled) return;
    for (const ray of _lightRays) {
      ray.phase += dt * 0.4;
      ray.x     += ray.speed * dt;
      // Wrap around
      if (ray.x < -ray.width)       ray.x = _canvasW + ray.width;
      if (ray.x > _canvasW + ray.width) ray.x = -ray.width;
    }
  }

  function _renderLightRays(ctx) {
    if (!_raysEnabled || _lightRays.length === 0) return;
    const rgb = _hexToRgb(_rayColor);

    ctx.save();
    for (const ray of _lightRays) {
      const pulseAlpha = ray.alpha * (0.6 + 0.4 * Math.sin(ray.phase));
      const halfW      = ray.width / 2;
      const halfWB     = halfW * 2.5; // wider at the bottom
      const len        = ray.length;
      const ang        = ray.angle;

      // Trapezoid points
      const x0 = ray.x - halfW;
      const x1 = ray.x + halfW;
      const x2 = ray.x + halfWB + Math.sin(ang) * len;
      const x3 = ray.x - halfWB + Math.sin(ang) * len;
      const y0 = 0;
      const y1 = 0;
      const y2 = len;
      const y3 = len;

      const grad = ctx.createLinearGradient(ray.x, 0, ray.x, len);
      grad.addColorStop(0,   `rgba(${rgb.r},${rgb.g},${rgb.b},${pulseAlpha})`);
      grad.addColorStop(0.7, `rgba(${rgb.r},${rgb.g},${rgb.b},${pulseAlpha * 0.3})`);
      grad.addColorStop(1,   `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Magic Particles ────────────────────────────────────────────────────────

  const MAGIC_TYPES = ['sparkle', 'rune', 'ember', 'star'];

  function _createMagicParticle(x, y, color, type) {
    const angle = _rand(0, Math.PI * 2);
    const speed = _rand(0.5, 2.5);
    const life  = _rand(0.5, 2.0);
    return {
      x,
      y,
      vx:      Math.cos(angle) * speed,
      vy:      Math.sin(angle) * speed - _rand(0.5, 1.5),
      color:   color || '#ccaaff',
      size:    _rand(2, 5),
      alpha:   _rand(0.6, 1.0),
      life,
      maxLife: life,
      type:    type || MAGIC_TYPES[_randInt(0, MAGIC_TYPES.length - 1)],
      spin:    _rand(-3, 3),
      angle:   _rand(0, Math.PI * 2),
    };
  }

  /**
   * Spawn a burst of magic particles at (x, y).
   * @param {number} x
   * @param {number} y
   * @param {string} color  CSS color
   * @param {number} count
   */
  function spawnMagicBurst(x, y, color, count) {
    const n = Math.min(count || 20, MAGIC_MAX - _magicParticles.length);
    for (let i = 0; i < n; i++) {
      _magicParticles.push(_createMagicParticle(x, y, color));
    }
  }

  /**
   * Spawn a small trail of magic particles at (x, y).
   * @param {number} x
   * @param {number} y
   * @param {string} color  CSS color
   */
  function spawnMagicTrail(x, y, color) {
    const n = Math.min(4, MAGIC_MAX - _magicParticles.length);
    for (let i = 0; i < n; i++) {
      const p = _createMagicParticle(x, y, color);
      p.size  = _rand(1, 3);
      p.life  = _rand(0.2, 0.8);
      p.maxLife = p.life;
      _magicParticles.push(p);
    }
  }

  function _updateMagicParticles(dt) {
    for (let i = _magicParticles.length - 1; i >= 0; i--) {
      const p  = _magicParticles[i];
      p.x     += p.vx * dt * 60;
      p.y     += p.vy * dt * 60;
      p.vy    += 0.02 * dt * 60; // slight gravity
      p.angle += p.spin * dt;
      p.life  -= dt;
      if (p.life <= 0) _magicParticles.splice(i, 1);
    }
  }

  function _renderMagicParticles(ctx) {
    if (_magicParticles.length === 0) return;
    ctx.save();
    for (const p of _magicParticles) {
      const ratio = p.maxLife > 0 ? p.life / p.maxLife : 1;
      ctx.globalAlpha = p.alpha * ratio;
      ctx.fillStyle   = p.color;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      switch (p.type) {
        case 'sparkle':
          _drawSparkle(ctx, p.size);
          break;
        case 'star':
          _drawStar(ctx, p.size, 5);
          break;
        case 'ember':
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 0.6, p.size, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'rune':
          ctx.font       = `${Math.round(p.size * 3)}px serif`;
          ctx.textAlign  = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('᛭', 0, 0);
          break;
        default:
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
      }

      ctx.restore();
    }
    ctx.restore();
  }

  function _drawSparkle(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2;
      const a1 = a0 + Math.PI / 8;
      ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
      ctx.lineTo(Math.cos(a1) * r * 0.3, Math.sin(a1) * r * 0.3);
    }
    ctx.closePath();
    ctx.fill();
  }

  function _drawStar(ctx, r, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const d = i % 2 === 0 ? r : r * 0.45;
      const method = i === 0 ? 'moveTo' : 'lineTo';
      ctx[method](Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ── Ambient Shimmer ────────────────────────────────────────────────────────

  /**
   * Enable or disable the ambient shimmer effect.
   * @param {boolean} bool
   */
  function enableShimmer(bool) {
    _shimmerEnabled = !!bool;
  }

  function _updateShimmer(dt) {
    if (!_shimmerEnabled) return;
    _shimmerPhase += dt * 0.8;
    if (_shimmerPhase > Math.PI * 2) _shimmerPhase -= Math.PI * 2;
  }

  function _renderShimmer(ctx, w, h) {
    if (!_shimmerEnabled) return;
    const brightness = 0.02 * Math.sin(_shimmerPhase);
    if (Math.abs(brightness) < 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = brightness > 0 ? 'screen' : 'multiply';
    ctx.globalAlpha              = Math.abs(brightness);
    ctx.fillStyle                = brightness > 0 ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Initialise the system for the given canvas dimensions.
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  function init(canvasWidth, canvasHeight) {
    _canvasW = canvasWidth  || 800;
    _canvasH = canvasHeight || 600;

    _dustParticles  = [];
    _fogWisps       = [];
    _magicParticles = [];
    _time           = 0;

    // Pre-spawn initial particles
    spawnDust(DUST_MAX, { x: 0, y: 0, w: _canvasW, h: _canvasH });

    // Pre-spawn initial fog wisps
    const wispCount = Math.ceil(_fogDensity * WISP_MAX);
    for (let i = 0; i < wispCount; i++) {
      const w = _createFogWisp();
      // Scatter initial wisps across the canvas
      w.x = _rand(0, _canvasW);
      _fogWisps.push(w);
    }

    // Init light rays if enabled
    if (_raysEnabled) {
      _lightRays = [];
      for (let i = 0; i < RAY_COUNT; i++) {
        _lightRays.push(_createLightRay(i));
      }
    }
  }

  /**
   * Advance all atmospheric effects by dt seconds.
   * @param {number} dt  Delta-time in seconds
   */
  function update(dt) {
    _time += dt;
    _updateDust(dt);
    _updateFogWisps(dt);
    _updateLightRays(dt);
    _updateMagicParticles(dt);
    _updateShimmer(dt);
  }

  /**
   * Render all atmospheric effects in screen space.
   * Apply this AFTER camera transform is reset (no world transform active).
   * Order: fog wisps → light rays → dust → magic particles → shimmer
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   */
  function render(ctx, canvasWidth, canvasHeight) {
    const w = canvasWidth  || _canvasW;
    const h = canvasHeight || _canvasH;
    _renderFogWisps(ctx);
    _renderLightRays(ctx);
    _renderDust(ctx);
    _renderMagicParticles(ctx);
    _renderShimmer(ctx, w, h);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    init,
    update,
    render,

    // Dust
    spawnDust,

    // Fog
    setFogDensity,

    // Light rays
    enableLightRays,
    setLightRayColor,

    // Magic particles
    spawnMagicBurst,
    spawnMagicTrail,

    // Shimmer
    enableShimmer,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AtmosphericEffects;
