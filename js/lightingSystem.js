/**
 * lightingSystem.js – Global Lighting & Post-Processing System
 * Manages dynamic light sources, post-processing effects, and shadow casting
 * for the PROJECT-JO D&D VTT canvas renderer.
 */

const LightingSystem = (() => {
  'use strict';

  // ── Private State ──────────────────────────────────────────────────────────

  let _lights = [];
  let _nextId  = 1;
  let _time    = 0; // elapsed seconds, for flicker/animation

  let _config = {
    ambientLevel:   0.35,
    ambientColor:   '#1a1228',
    vignette:       { enabled: true,  strength: 0.6 },
    bloom:          { enabled: false, threshold: 0.7, intensity: 0.4 },
    colorGrade:     { enabled: false, tint: '#ffddaa', strength: 0.08 },
    fog:            { enabled: false, density: 0.3,   color: '#c8d8e8' },
    filmGrain:      { enabled: false, strength: 0.04 },
  };

  // Weather presets
  const WEATHER_PRESETS = {
    clear:    { ambientLevel: 0.55, fogDensity: 0.0,  grainStr: 0.02, tint: '#fff8e8', tintStr: 0.04 },
    overcast: { ambientLevel: 0.35, fogDensity: 0.15, grainStr: 0.03, tint: '#d0d8e0', tintStr: 0.10 },
    storm:    { ambientLevel: 0.15, fogDensity: 0.25, grainStr: 0.06, tint: '#8090a8', tintStr: 0.15 },
    fog:      { ambientLevel: 0.30, fogDensity: 0.60, grainStr: 0.02, tint: '#c8d8e8', tintStr: 0.12 },
  };

  // Time-of-day ambient color temperatures (hour → { color, level })
  const TOD_TABLE = [
    { hour:  0, color: '#080610', level: 0.05 }, // midnight
    { hour:  4, color: '#0a0820', level: 0.05 }, // deep night
    { hour:  5, color: '#1a1040', level: 0.10 }, // pre-dawn
    { hour:  6, color: '#3a2858', level: 0.25 }, // dawn
    { hour:  7, color: '#7a5040', level: 0.45 }, // sunrise
    { hour:  8, color: '#c08858', level: 0.60 }, // morning
    { hour: 10, color: '#d8b878', level: 0.75 }, // late morning
    { hour: 12, color: '#e8d8b8', level: 0.90 }, // noon
    { hour: 14, color: '#e0d0a8', level: 0.85 }, // afternoon
    { hour: 17, color: '#c08858', level: 0.65 }, // late afternoon
    { hour: 18, color: '#a06838', level: 0.45 }, // sunset
    { hour: 19, color: '#5a3050', level: 0.25 }, // dusk
    { hour: 20, color: '#1a1038', level: 0.10 }, // evening
    { hour: 22, color: '#0c0820', level: 0.06 }, // night
    { hour: 24, color: '#080610', level: 0.05 }, // midnight (wrap)
  ];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _lerp(a, b, t) {
    return a + (b - a) * t;
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

  function _lerpColor(hexA, hexB, t) {
    const a = _hexToRgb(hexA);
    const b = _hexToRgb(hexB);
    const r = Math.round(_lerp(a.r, b.r, t));
    const g = Math.round(_lerp(a.g, b.g, t));
    const bl = Math.round(_lerp(a.b, b.b, t));
    return `rgb(${r},${g},${bl})`;
  }

  // Simple seeded noise-like function for flicker variation
  function _pseudoNoise(x) {
    const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  // ── Light Source Management ────────────────────────────────────────────────

  /**
   * Add a light source.
   * @param {Object} cfg - { x, y, radius, color, intensity, type, flickerRate }
   * @returns {number} Assigned light id
   */
  function addLight(cfg = {}) {
    const id = _nextId++;
    _lights.push({
      id,
      x:           cfg.x           ?? 0,
      y:           cfg.y           ?? 0,
      radius:      cfg.radius      ?? 80,
      color:       cfg.color       ?? '#ffcc66',
      intensity:   cfg.intensity   ?? 1.0,
      type:        cfg.type        ?? 'torch',
      flickerRate: cfg.flickerRate ?? 1.0,
      _phase:      Math.random() * Math.PI * 2,
    });
    return id;
  }

  /** Remove a light source by id. */
  function removeLight(id) {
    _lights = _lights.filter(l => l.id !== id);
  }

  /** Update one or more properties of a light source. */
  function updateLight(id, props = {}) {
    const light = _lights.find(l => l.id === id);
    if (!light) return;
    Object.assign(light, props);
  }

  /** Get a shallow copy of all lights. */
  function getLights() {
    return _lights.map(l => Object.assign({}, l));
  }

  /** Remove all light sources. */
  function clearLights() {
    _lights = [];
  }

  // ── Per-light intensity computation ───────────────────────────────────────

  function _computeIntensity(light) {
    let base = light.intensity;
    switch (light.type) {
      case 'torch': {
        // Fast flicker using sin wave + pseudo-noise
        const sin1  = Math.sin(_time * 6.0 * light.flickerRate + light._phase);
        const sin2  = Math.sin(_time * 17.3 * light.flickerRate + light._phase * 2.1);
        const noise = _pseudoNoise(_time * 3.7 * light.flickerRate + light._phase) * 2 - 1;
        base *= 0.88 + 0.07 * sin1 + 0.03 * sin2 + 0.02 * noise;
        break;
      }
      case 'spell': {
        // Smooth pulsing glow
        const pulse = Math.sin(_time * 2.5 * light.flickerRate + light._phase);
        base *= 0.85 + 0.15 * pulse;
        break;
      }
      case 'aura': {
        // Very gentle breathing
        const breath = Math.sin(_time * 1.2 * light.flickerRate + light._phase);
        base *= 0.92 + 0.08 * breath;
        break;
      }
      case 'ambient':
      default:
        // Static
        break;
    }
    return Math.max(0, Math.min(1, base));
  }

  // ── Render Lighting Layer ──────────────────────────────────────────────────

  /**
   * Render the full lighting compositing layer onto the main canvas context.
   * Call this AFTER drawing the scene tiles/tokens, BEFORE post-processing.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ offsetX, offsetY, zoom }} viewState
   * @param {number} tileSize
   */
  function renderLightingLayer(ctx, viewState, tileSize) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    // Build offscreen light map
    const offscreen = _getOffscreenCanvas(W, H);
    const lctx      = offscreen.getContext('2d');

    lctx.clearRect(0, 0, W, H);

    // Fill with ambient darkness
    const ambRgb = _hexToRgb(_config.ambientColor);
    const ambA   = 1.0 - _config.ambientLevel;
    lctx.fillStyle = `rgba(${ambRgb.r},${ambRgb.g},${ambRgb.b},${ambA})`;
    lctx.fillRect(0, 0, W, H);

    // Each light source punches a hole in the darkness
    lctx.globalCompositeOperation = 'destination-out';

    for (const light of _lights) {
      const screenX  = (light.x * tileSize - viewState.offsetX) * (viewState.zoom ?? 1);
      const screenY  = (light.y * tileSize - viewState.offsetY) * (viewState.zoom ?? 1);
      const radius   = light.radius * (viewState.zoom ?? 1);
      const eff      = _computeIntensity(light);
      const rgb      = _hexToRgb(light.color);

      const grad = lctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius);
      grad.addColorStop(0,    `rgba(${rgb.r},${rgb.g},${rgb.b},${eff})`);

      // Auras have a softer edge; torches/spells are more defined
      const midStop = light.type === 'aura' ? 0.5 : 0.7;
      grad.addColorStop(midStop, `rgba(${rgb.r},${rgb.g},${rgb.b},${eff * 0.4})`);
      grad.addColorStop(1,       `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);

      lctx.beginPath();
      lctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      lctx.fillStyle = grad;
      lctx.fill();
    }

    lctx.globalCompositeOperation = 'source-over';

    // Composite the light map onto the main canvas using multiply
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(offscreen, 0, 0);
    ctx.globalCompositeOperation = prev;
  }

  // ── Offscreen Canvas Cache ─────────────────────────────────────────────────

  let _offscreenCanvas = null;
  let _offscreenW = 0;
  let _offscreenH = 0;

  function _getOffscreenCanvas(w, h) {
    if (!_offscreenCanvas || _offscreenW !== w || _offscreenH !== h) {
      _offscreenCanvas = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
      _offscreenW = w;
      _offscreenH = h;
    }
    return _offscreenCanvas;
  }

  // ── Post-Processing Effects ────────────────────────────────────────────────

  /**
   * Radial gradient vignette overlay.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ offsetX, offsetY }} viewState  (unused, kept for API symmetry)
   * @param {number} strength  0–1
   */
  function vignetteEffect(ctx, viewState, strength) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const r  = Math.sqrt(cx * cx + cy * cy);

    const s   = strength ?? _config.vignette.strength;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${s})`);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /**
   * Simulated bloom effect – draws a blurred bright overlay.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} viewState
   * @param {number} threshold  0–1 brightness threshold
   * @param {number} intensity  0–1 bloom intensity
   */
  function bloomEffect(ctx, viewState, threshold, intensity) {
    const W  = ctx.canvas.width;
    const H  = ctx.canvas.height;
    const th = threshold ?? _config.bloom.threshold;
    const it = intensity  ?? _config.bloom.intensity;

    // We simulate bloom with a large blurred semi-transparent white overlay
    // on the center region where lights would be brightest.
    const bloom = _getOffscreenCanvas(W, H);
    const bctx  = bloom.getContext('2d');
    bctx.clearRect(0, 0, W, H);

    for (const light of _lights) {
      if (light.intensity < th) continue;
      const eff    = _computeIntensity(light);
      const rgb    = _hexToRgb(light.color);
      const r      = light.radius * 0.4 * (viewState.zoom ?? 1);
      const sx     = (light.x * (viewState.tileSize ?? 48) - viewState.offsetX) * (viewState.zoom ?? 1);
      const sy     = (light.y * (viewState.tileSize ?? 48) - viewState.offsetY) * (viewState.zoom ?? 1);
      const alpha  = it * eff * 0.5;

      const g = bctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      bctx.fillStyle = g;
      bctx.beginPath();
      bctx.arc(sx, sy, r, 0, Math.PI * 2);
      bctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(bloom, 0, 0);
    ctx.restore();
  }

  /**
   * Apply a color tint over the whole canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} viewState
   * @param {string} tint      CSS color string
   * @param {number} strength  0–1
   */
  function colorGradeEffect(ctx, viewState, tint, strength) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const t = tint     ?? _config.colorGrade.tint;
    const s = strength ?? _config.colorGrade.strength;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = s;
    ctx.fillStyle   = t;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /**
   * Horizontal fog gradient layers drifting across the canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} viewState
   * @param {number} density  0–1
   * @param {string} color    CSS color string
   */
  function fogEffect(ctx, viewState, density, color) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const d = density ?? _config.fog.density;
    const c = color   ?? _config.fog.color;

    if (d <= 0) return;

    const rgb    = _hexToRgb(c);
    const layers = Math.ceil(d * 5);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (let i = 0; i < layers; i++) {
      const phase  = (_time * (0.4 + i * 0.15) + i * 1.7) % (W * 2);
      const yFrac  = 0.5 + (i / layers) * 0.4;
      const cy     = H * yFrac;
      const ht     = H * (0.08 + 0.05 * i);
      const alpha  = d * (0.05 + 0.04 * i) * (0.5 + 0.5 * Math.sin(_time * 0.3 + i));

      const grad = ctx.createLinearGradient(0, cy - ht, 0, cy + ht);
      grad.addColorStop(0,   `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      grad.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`);
      grad.addColorStop(1,   `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);

      ctx.fillStyle = grad;
      ctx.fillRect(-W + phase, cy - ht, W * 2, ht * 2);
    }

    ctx.restore();
  }

  /**
   * Animated film grain noise overlay.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} viewState
   * @param {number} strength  0–1
   */
  function filmGrainEffect(ctx, viewState, strength) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const s = strength ?? _config.filmGrain.strength;

    if (s <= 0) return;

    const grain = _getOffscreenCanvas(W, H);
    const gctx  = grain.getContext('2d');
    const id    = gctx.createImageData(W, H);
    const data  = id.data;
    const seed  = Math.floor(_time * 30) * 9301; // changes every frame

    for (let i = 0; i < data.length; i += 4) {
      const v = _pseudoNoise(i + seed) * 2 - 1;
      const n = Math.round(v * 255 * s);
      data[i]     = 128 + n;
      data[i + 1] = 128 + n;
      data[i + 2] = 128 + n;
      data[i + 3] = Math.round(s * 60);
    }

    gctx.putImageData(id, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(grain, 0, 0);
    ctx.restore();
  }

  // ── Global Light State ─────────────────────────────────────────────────────

  /**
   * Set the ambient light level.
   * @param {number} level  0 (pitch black) to 1 (full daylight)
   */
  function setAmbientLevel(level) {
    _config.ambientLevel = Math.max(0, Math.min(1, level));
  }

  /**
   * Set the time of day, adjusting ambient color temperature and level.
   * @param {number} hour  0–24
   */
  function setTimeOfDay(hour) {
    const h = ((hour % 24) + 24) % 24;
    let prev = TOD_TABLE[0];
    let next = TOD_TABLE[TOD_TABLE.length - 1];

    for (let i = 0; i < TOD_TABLE.length - 1; i++) {
      if (h >= TOD_TABLE[i].hour && h < TOD_TABLE[i + 1].hour) {
        prev = TOD_TABLE[i];
        next = TOD_TABLE[i + 1];
        break;
      }
    }

    const span = next.hour - prev.hour;
    const t    = span > 0 ? (h - prev.hour) / span : 0;

    _config.ambientLevel = _lerp(prev.level, next.level, t);
    _config.ambientColor = _lerpColor(prev.color, next.color, t);
  }

  /**
   * Set weather type, adjusting ambient and effect parameters.
   * @param {'clear'|'overcast'|'storm'|'fog'} type
   */
  function setWeather(type) {
    const preset = WEATHER_PRESETS[type];
    if (!preset) return;

    _config.ambientLevel           = preset.ambientLevel;
    _config.fog.density            = preset.fogDensity;
    _config.fog.enabled            = preset.fogDensity > 0;
    _config.filmGrain.strength     = preset.grainStr;
    _config.colorGrade.tint        = preset.tint;
    _config.colorGrade.strength    = preset.tintStr;
    _config.colorGrade.enabled     = preset.tintStr > 0;
  }

  // ── Shadow Casting (Simplified) ────────────────────────────────────────────

  /**
   * Compute simplified shadow hints for a set of obstacles.
   * Returns an array of shadow polygons (arrays of {x, y} points).
   *
   * @param {Array}  lights     Array of light configs
   * @param {Array}  obstacles  Array of { x, y, w, h } bounding boxes (in tile units)
   * @param {number} tileSize
   * @returns {Array} Array of shadow polygon hint objects
   */
  function computeShadows(lights, obstacles, tileSize) {
    const shadows = [];

    for (const light of lights) {
      const lx = light.x;
      const ly = light.y;

      for (const obs of obstacles) {
        const corners = [
          { x: obs.x,          y: obs.y },
          { x: obs.x + obs.w,  y: obs.y },
          { x: obs.x + obs.w,  y: obs.y + obs.h },
          { x: obs.x,          y: obs.y + obs.h },
        ];

        // Find the two extreme corners relative to the light direction
        let minAngle = Infinity;
        let maxAngle = -Infinity;
        let minCorner = corners[0];
        let maxCorner = corners[0];

        for (const c of corners) {
          const angle = Math.atan2(c.y - ly, c.x - lx);
          if (angle < minAngle) { minAngle = angle; minCorner = c; }
          if (angle > maxAngle) { maxAngle = angle; maxCorner = c; }
        }

        const reach = (light.radius / tileSize) * 1.5;

        // Project shadow rays
        const proj1 = {
          x: minCorner.x + Math.cos(minAngle) * reach,
          y: minCorner.y + Math.sin(minAngle) * reach,
        };
        const proj2 = {
          x: maxCorner.x + Math.cos(maxAngle) * reach,
          y: maxCorner.y + Math.sin(maxAngle) * reach,
        };

        shadows.push({
          lightId:  light.id,
          polygon:  [minCorner, maxCorner, proj2, proj1],
          lightPos: { x: lx, y: ly },
        });
      }
    }

    return shadows;
  }

  /**
   * Draw soft gradient shadows onto the canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} shadows  From computeShadows()
   * @param {{ offsetX, offsetY, zoom }} viewState
   * @param {number} tileSize
   */
  function drawSoftShadows(ctx, shadows, viewState, tileSize) {
    if (!shadows || !shadows.length) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (const shadow of shadows) {
      const poly  = shadow.polygon;
      if (!poly || poly.length < 3) continue;

      const zoom = viewState.zoom ?? 1;

      // Convert tile coords to screen coords
      const pts = poly.map(p => ({
        x: (p.x * tileSize - viewState.offsetX) * zoom,
        y: (p.y * tileSize - viewState.offsetY) * zoom,
      }));

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Configuration ──────────────────────────────────────────────────────────

  /**
   * Merge options into the current configuration.
   * @param {Object} options
   */
  function configure(options = {}) {
    if (options.ambientLevel !== undefined) _config.ambientLevel = options.ambientLevel;
    if (options.ambientColor !== undefined) _config.ambientColor = options.ambientColor;
    if (options.vignette)   Object.assign(_config.vignette,   options.vignette);
    if (options.bloom)      Object.assign(_config.bloom,      options.bloom);
    if (options.colorGrade) Object.assign(_config.colorGrade, options.colorGrade);
    if (options.fog)        Object.assign(_config.fog,        options.fog);
    if (options.filmGrain)  Object.assign(_config.filmGrain,  options.filmGrain);
  }

  /** Return a deep copy of the current configuration. */
  function getConfig() {
    return JSON.parse(JSON.stringify(_config));
  }

  // ── Update Loop ────────────────────────────────────────────────────────────

  /**
   * Advance all animation timers.
   * @param {number} dt  Delta-time in seconds
   */
  function update(dt) {
    _time += dt;
    if (_time > 1e6) _time -= 1e6; // prevent float drift over very long sessions
  }

  // ── Apply All Enabled Effects ─────────────────────────────────────────────

  /**
   * Convenience: apply all enabled post-processing effects in the correct order.
   * Call this after your scene render and lighting layer.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} viewState
   * @param {number} tileSize
   */
  function applyPostProcessing(ctx, viewState, tileSize) {
    if (_config.fog.enabled)        fogEffect(ctx, viewState, _config.fog.density, _config.fog.color);
    if (_config.bloom.enabled)      bloomEffect(ctx, viewState, _config.bloom.threshold, _config.bloom.intensity);
    if (_config.colorGrade.enabled) colorGradeEffect(ctx, viewState, _config.colorGrade.tint, _config.colorGrade.strength);
    if (_config.vignette.enabled)   vignetteEffect(ctx, viewState, _config.vignette.strength);
    if (_config.filmGrain.enabled)  filmGrainEffect(ctx, viewState, _config.filmGrain.strength);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // Light source management
    addLight,
    removeLight,
    updateLight,
    getLights,
    clearLights,

    // Rendering
    renderLightingLayer,
    applyPostProcessing,

    // Post-processing (individually callable)
    vignetteEffect,
    bloomEffect,
    colorGradeEffect,
    fogEffect,
    filmGrainEffect,

    // Global state
    setAmbientLevel,
    setTimeOfDay,
    setWeather,

    // Shadow casting
    computeShadows,
    drawSoftShadows,

    // Configuration
    configure,
    getConfig,

    // Update loop
    update,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LightingSystem;
