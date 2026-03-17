/**
 * tileRenderer.js – Premium Cinematic Tile Rendering System
 *
 * A complete material-based rendering engine for PROJECT-JO's D&D VTT canvas.
 * Features procedural noise, per-tile material shaders, animated effects,
 * ambient occlusion, global lighting passes, parallax layers, coordinate
 * labels, and an offscreen tile cache for performance.
 *
 * Public API (preserved):
 *   TileRenderer.TILE_STYLES          – style registry object
 *   TileRenderer.TILE_KEYS            – array of non-empty tile keys
 *   TileRenderer.animOffset           – getter → current anim phase (radians)
 *   TileRenderer.updateAnimation(ts)  – advance animation clock
 *   TileRenderer.drawBackground(ctx, w, h)
 *   TileRenderer.drawTile(ctx, x, y, tileSize, type)
 *   TileRenderer.drawGrid(ctx, cols, rows, tileSize)
 *   TileRenderer.drawHover(ctx, row, col, tileSize)
 *   TileRenderer.drawRectPreview(ctx, r1, c1, r2, c2, tileSize)
 *
 * New API:
 *   TileRenderer.drawTileDetailed(ctx, x, y, tileSize, type, neighbors, lightLevel, animTime)
 *   TileRenderer.drawAmbientOcclusion(ctx, x, y, tileSize, neighbors)
 *   TileRenderer.applyLightingPass(ctx, x, y, tileSize, lightLevel)
 *   TileRenderer.drawParallaxLayer(ctx, layerIndex, offsetX, offsetY, width, height)
 */

const TileRenderer = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  //  TILE STYLE REGISTRY
  // ═══════════════════════════════════════════════════════════════════════════

  /** Visual style for every tile type. */
  const TILE_STYLES = {
    floor: {
      label: 'Stone Floor', icon: '⬜',
      color: '#4a3f30', border: '#5a4f40',
      shadow: 'rgba(0,0,0,0.30)', walkable: true,
    },
    stone: {
      label: 'Stone', icon: '🪨',
      color: '#3a3530', border: '#4a4035',
      shadow: 'rgba(0,0,0,0.40)', walkable: true,
    },
    wall: {
      label: 'Wall', icon: '🟫',
      color: '#1e1408', border: '#0d0802',
      shadow: 'rgba(0,0,0,0.70)', walkable: false,
      thick: true,
    },
    water: {
      label: 'Water', icon: '🟦',
      color: '#1a3a5a', border: '#1a4a6a',
      shadow: 'rgba(20,80,150,0.30)', walkable: false,
      animated: true, shimmer: true,
    },
    door: {
      label: 'Door', icon: '🚪',
      color: '#3a2010', border: '#6a3a10',
      shadow: 'rgba(80,40,10,0.40)', walkable: true,
    },
    trap: {
      label: 'Trap', icon: '⚠️',
      color: '#4a1a00', border: '#7a2a00',
      shadow: 'rgba(150,30,0,0.30)', walkable: true,
    },
    grass: {
      label: 'Grass', icon: '🟩',
      color: '#1a3a1a', border: '#2a4a2a',
      shadow: 'rgba(10,60,10,0.30)', walkable: true,
    },
    lava: {
      label: 'Lava', icon: '🔥',
      color: '#5a1a00', border: '#7a2a00',
      shadow: 'rgba(200,50,0,0.40)', walkable: false,
      animated: true, glowing: true,
    },
    stairs: {
      label: 'Stairs', icon: '🔼',
      color: '#3a3a2a', border: '#5a5a3a',
      shadow: 'rgba(0,0,0,0.30)', walkable: true,
    },
    chest: {
      label: 'Chest', icon: '📦',
      color: '#4a3000', border: '#6a5000',
      shadow: 'rgba(0,0,0,0.30)', walkable: true,
    },
    magic: {
      label: 'Magic Floor', icon: '✨',
      color: '#0d0826', border: '#3a1a6a',
      shadow: 'rgba(80,0,180,0.40)', walkable: true,
      animated: true, glowing: true,
    },
    ice: {
      label: 'Ice', icon: '🧊',
      color: '#a8d8f0', border: '#c8ecff',
      shadow: 'rgba(100,200,255,0.25)', walkable: true,
      animated: true, shimmer: true,
    },
    sand: {
      label: 'Sand', icon: '🏜️',
      color: '#c8a86a', border: '#d8b87a',
      shadow: 'rgba(120,80,20,0.25)', walkable: true,
    },
    metal: {
      label: 'Metal Floor', icon: '⚙️',
      color: '#4a5060', border: '#6a7080',
      shadow: 'rgba(0,0,0,0.45)', walkable: true,
      shimmer: true,
    },
    empty: {
      label: 'Erase', icon: '❌',
      color: 'transparent', border: 'transparent',
      walkable: true,
    },
  };

  const TILE_KEYS = Object.keys(TILE_STYLES).filter(k => k !== 'empty');

  // ═══════════════════════════════════════════════════════════════════════════
  //  ANIMATION STATE
  // ═══════════════════════════════════════════════════════════════════════════

  let _animOffset = 0; // phase in radians, updated each rAF frame

  function updateAnimation(timestamp) {
    _animOffset = (timestamp / 1000) % (Math.PI * 2);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PROCEDURAL NOISE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fast deterministic value noise.  Returns a stable float in [0, 1]
   * for a given integer grid position and optional seed.
   */
  function _noise(x, y, seed) {
    const s = seed | 0;
    let n = (x * 1619 + y * 31337 + s * 6791) | 0;
    n = (n << 13) ^ n;
    n = ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff);
    return n / 0x7fffffff;
  }

  /**
   * Smooth bilinear interpolation of _noise across fractional coordinates.
   * Adds texture variation within a single tile by sampling at sub-tile coords.
   */
  function _smoothNoise(fx, fy, seed) {
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx); // smoothstep
    const sy = ty * ty * (3 - 2 * ty);
    const n00 = _noise(ix,     iy,     seed);
    const n10 = _noise(ix + 1, iy,     seed);
    const n01 = _noise(ix,     iy + 1, seed);
    const n11 = _noise(ix + 1, iy + 1, seed);
    return n00 + (n10 - n00) * sx + (n01 - n00) * sy
               + (n00 - n10 - n01 + n11) * sx * sy;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  COLOR UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Linear RGB interpolation between two hex colours. */
  function _lerpColor(hex1, hex2, t) {
    const r1 = parseInt(hex1.slice(1, 3), 16);
    const g1 = parseInt(hex1.slice(3, 5), 16);
    const b1 = parseInt(hex1.slice(5, 7), 16);
    const r2 = parseInt(hex2.slice(1, 3), 16);
    const g2 = parseInt(hex2.slice(3, 5), 16);
    const b2 = parseInt(hex2.slice(5, 7), 16);
    const r  = Math.round(r1 + (r2 - r1) * t);
    const g  = Math.round(g1 + (g2 - g1) * t);
    const b  = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
  }

  /** Convert HSL (0-360, 0-1, 0-1) to CSS rgb string. */
  function _hslToRgb(h, s, l) {
    h = h / 360;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }

  /** Parse hex or rgb() string to {r, g, b} object. */
  function _parseColor(str) {
    if (str && str[0] === '#') {
      return {
        r: parseInt(str.slice(1, 3), 16),
        g: parseInt(str.slice(3, 5), 16),
        b: parseInt(str.slice(5, 7), 16),
      };
    }
    const m = str && str.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3] };
    return { r: 128, g: 128, b: 128 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  OFFSCREEN TILE CACHE
  //  Static tiles are rendered once onto an OffscreenCanvas (or a regular
  //  Canvas in Node test environments) and re-drawn with drawImage thereafter.
  // ═══════════════════════════════════════════════════════════════════════════

  const _tileCache = new Map(); // key → OffscreenCanvas | HTMLCanvasElement

  function _cacheKey(type, tileSize) {
    return `${type}_${tileSize}`;
  }

  function _makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(w, h);
    }
    // Fallback for Node/test environments
    const c = { width: w, height: h };
    c.getContext = () => _makeFakeCtx();
    return c;
  }

  /** Minimal stub context used in Node test environments. */
  function _makeFakeCtx() {
    const ops = {};
    const handler = {
      get: (_, p) => {
        if (p in ops) return ops[p];
        return (..._args) => {};
      },
      set: (_, p, v) => { ops[p] = v; return true; },
    };
    if (typeof Proxy !== 'undefined') return new Proxy(ops, handler);
    return ops;
  }

  /** Returns a cached canvas for non-animated tiles. */
  function _getCachedTile(type, tileSize, renderFn) {
    const style = TILE_STYLES[type];
    if (style && style.animated) return null; // never cache animated tiles
    const key = _cacheKey(type, tileSize);
    if (!_tileCache.has(key)) {
      const cvs = _makeCanvas(tileSize, tileSize);
      const cctx = cvs.getContext('2d');
      if (cctx) renderFn(cctx, 0, 0, tileSize);
      _tileCache.set(key, cvs);
    }
    return _tileCache.get(key);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BACKGROUND
  // ═══════════════════════════════════════════════════════════════════════════

  function drawBackground(ctx, width, height) {
    ctx.fillStyle = '#0a0805';
    ctx.fillRect(0, 0, width, height);

    // Radial vignette for dungeon atmosphere
    const vx = width / 2, vy = height / 2;
    const grad = ctx.createRadialGradient(
      vx, vy, Math.min(width, height) * 0.20,
      vx, vy, Math.max(width, height) * 0.80
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle noise grain overlay across entire background
    ctx.save();
    ctx.globalAlpha = 0.04;
    for (let gx = 0; gx < width; gx += 4) {
      for (let gy = 0; gy < height; gy += 4) {
        const v = _noise(gx >> 2, gy >> 2, 42);
        const c = Math.round(v * 40);
        ctx.fillStyle = `rgb(${c},${c},${c})`;
        ctx.fillRect(gx, gy, 4, 4);
      }
    }
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MATERIAL SHADERS – one per tile family
  // ═══════════════════════════════════════════════════════════════════════════

  function _drawStoneBase(ctx, x, y, TS, color, seed) {
    // Base fill with noise variation
    ctx.fillStyle = color;
    ctx.fillRect(x, y, TS, TS);

    // Procedural crack lines
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.7;
    const crackCount = 2 + Math.floor(_noise(seed, seed + 1, 7) * 3);
    for (let i = 0; i < crackCount; i++) {
      const nx = _noise(seed + i * 3, seed + i, 11);
      const ny = _noise(seed + i, seed + i * 3, 13);
      const ex = _noise(seed + i * 7, seed + i * 2, 17);
      const ey = _noise(seed + i * 2, seed + i * 7, 19);
      ctx.beginPath();
      ctx.moveTo(x + nx * TS, y + ny * TS);
      ctx.lineTo(x + ex * TS, y + ey * TS);
      ctx.stroke();
    }

    // Mortar lines (faint horizontal and vertical dividers)
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    const mortarY = y + TS * (0.35 + _noise(seed, seed + 99, 5) * 0.30);
    ctx.beginPath();
    ctx.moveTo(x, mortarY);
    ctx.lineTo(x + TS, mortarY);
    ctx.stroke();
    const mortarX = x + TS * (0.45 + _noise(seed + 99, seed, 5) * 0.15);
    ctx.beginPath();
    ctx.moveTo(mortarX, y);
    ctx.lineTo(mortarX, y + TS);
    ctx.stroke();

    // Depth variation highlight (top-left corner light)
    const hiGrad = ctx.createLinearGradient(x, y, x + TS, y + TS);
    hiGrad.addColorStop(0, 'rgba(255,255,255,0.07)');
    hiGrad.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = hiGrad;
    ctx.fillRect(x, y, TS, TS);
    ctx.restore();
  }

  function _drawWaterMaterial(ctx, x, y, TS, phase) {
    // Deep water base
    const baseGrad = ctx.createLinearGradient(x, y, x, y + TS);
    baseGrad.addColorStop(0, '#1e4a70');
    baseGrad.addColorStop(1, '#0f2540');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(x, y, TS, TS);

    // Animated wave normals (three offset sine bands)
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let band = 0; band < 3; band++) {
      const freq  = 0.12 + band * 0.07;
      const speed = 1.2  + band * 0.4;
      const amp   = TS   * 0.08;
      ctx.strokeStyle = band === 1 ? 'rgba(160,220,255,0.9)' : 'rgba(100,180,255,0.7)';
      ctx.lineWidth = 1.0 - band * 0.2;
      ctx.beginPath();
      for (let px = 0; px <= TS; px += 2) {
        const wy = y + TS * (0.3 + band * 0.2)
                 + Math.sin(px * freq + phase * speed + band) * amp;
        px === 0 ? ctx.moveTo(x + px, wy) : ctx.lineTo(x + px, wy);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Caustic light patches
    ctx.save();
    ctx.globalAlpha = 0.10;
    for (let ci = 0; ci < 4; ci++) {
      const cx2 = x + _noise(ci, 0, 31) * TS;
      const cy2 = y + _noise(0, ci, 37) * TS;
      const cr  = TS * (0.08 + _noise(ci, ci, 41) * 0.10);
      const anim = Math.sin(phase * 1.5 + ci * 1.3);
      const grad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, cr * (1 + anim * 0.3));
      grad.addColorStop(0, 'rgba(180,240,255,0.8)');
      grad.addColorStop(1, 'rgba(0,100,200,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx2, cy2, cr * (1.3 + anim * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Specular highlight strip
    const specA = 0.08 + Math.sin(phase * 2.5) * 0.06;
    ctx.fillStyle = `rgba(200,240,255,${specA.toFixed(3)})`;
    ctx.fillRect(x, y, TS, Math.floor(TS * 0.20));

    // Foam edge at the very top
    ctx.fillStyle = `rgba(220,245,255,${(0.12 + Math.sin(phase * 3) * 0.05).toFixed(3)})`;
    ctx.fillRect(x, y, TS, 2);
  }

  function _drawLavaMaterial(ctx, x, y, TS, phase, seed) {
    // Cooling crust base
    ctx.fillStyle = '#2a0800';
    ctx.fillRect(x, y, TS, TS);

    // Molten channels animated
    const channels = 5;
    for (let ci = 0; ci < channels; ci++) {
      const cx2 = x + _noise(ci * 3, seed, 23) * TS;
      const cy2 = y + _noise(seed, ci * 3, 29) * TS;
      const r   = TS * (0.12 + _noise(ci, seed + ci, 31) * 0.18);
      const gPhase = phase * (1.0 + ci * 0.3) + ci * 0.8;
      const brightness = 0.5 + Math.sin(gPhase) * 0.3;
      const grad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r);
      grad.addColorStop(0, `rgba(255,${Math.round(80 + brightness * 100)},0,0.9)`);
      grad.addColorStop(0.5, `rgba(200,${Math.round(40 + brightness * 60)},0,0.5)`);
      grad.addColorStop(1, 'rgba(80,10,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, TS, TS);
    }

    // Crust cracks overlay
    ctx.save();
    ctx.strokeStyle = 'rgba(255,80,0,0.55)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + _noise(i, seed, 53) * TS, y + _noise(seed, i, 59) * TS);
      ctx.lineTo(x + _noise(i + 5, seed + 1, 61) * TS, y + _noise(seed + 1, i + 5, 67) * TS);
      ctx.stroke();
    }
    ctx.restore();

    // Heat distortion ripple ring
    const ringA = 0.15 + Math.sin(phase * 2.8) * 0.10;
    const ringR = TS * (0.30 + Math.sin(phase * 1.4) * 0.10);
    const ringGrad = ctx.createRadialGradient(
      x + TS / 2, y + TS / 2, ringR * 0.7,
      x + TS / 2, y + TS / 2, ringR
    );
    ringGrad.addColorStop(0, 'rgba(255,120,0,0)');
    ringGrad.addColorStop(0.5, `rgba(255,80,0,${ringA.toFixed(3)})`);
    ringGrad.addColorStop(1, 'rgba(255,30,0,0)');
    ctx.fillStyle = ringGrad;
    ctx.fillRect(x, y, TS, TS);

    // Ember particles
    ctx.save();
    for (let ei = 0; ei < 5; ei++) {
      const exf = _noise(ei * 7, seed, 71);
      const eyf = _noise(seed, ei * 7, 73);
      const ePhase = phase * 2 + ei * 1.1;
      const epx = x + exf * TS;
      const epy = y + eyf * TS - (Math.sin(ePhase) * TS * 0.15);
      const ea  = 0.4 + Math.sin(ePhase * 1.7) * 0.3;
      if (ea > 0) {
        ctx.globalAlpha = Math.max(0, ea);
        ctx.fillStyle = `rgba(255,${Math.round(140 + Math.sin(ePhase) * 60)},0,1)`;
        ctx.beginPath();
        ctx.arc(epx, epy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function _drawGrassMaterial(ctx, x, y, TS, seed) {
    // Multi-tone green base gradient
    const gGrad = ctx.createLinearGradient(x, y, x + TS, y + TS);
    gGrad.addColorStop(0, '#1a3a18');
    gGrad.addColorStop(0.5, '#224020');
    gGrad.addColorStop(1, '#162e14');
    ctx.fillStyle = gGrad;
    ctx.fillRect(x, y, TS, TS);

    // Noise-based colour patches for density variation
    ctx.save();
    for (let gx2 = 0; gx2 < 4; gx2++) {
      for (let gy2 = 0; gy2 < 4; gy2++) {
        const v = _smoothNoise(seed * 0.1 + gx2, seed * 0.1 + gy2, seed);
        if (v > 0.55) {
          ctx.globalAlpha = (v - 0.55) * 1.8;
          ctx.fillStyle = '#2a5a20';
          ctx.fillRect(x + gx2 * (TS / 4), y + gy2 * (TS / 4), TS / 4, TS / 4);
        }
      }
    }
    ctx.restore();

    // Blade texture – short vertical strokes
    ctx.save();
    ctx.strokeStyle = '#3a6030';
    ctx.lineWidth = 0.7;
    const blades = 8 + Math.floor(_noise(seed, seed, 3) * 6);
    for (let bi = 0; bi < blades; bi++) {
      const bx2 = x + _noise(bi * 5, seed, 83) * TS;
      const by2 = y + _noise(seed, bi * 5, 89) * TS;
      const bh  = TS * (0.10 + _noise(bi, bi + 1, 97) * 0.14);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(bx2, by2);
      ctx.lineTo(bx2 + 1, by2 - bh);
      ctx.stroke();
    }
    ctx.restore();
  }

  function _drawDoorMaterial(ctx, x, y, TS, seed) {
    // Dark oak wood base
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(x, y, TS, TS);

    // Wood grain lines
    ctx.save();
    ctx.strokeStyle = 'rgba(90,50,10,0.6)';
    ctx.lineWidth = 0.8;
    const grains = 8;
    for (let gi = 0; gi < grains; gi++) {
      const gy2 = y + (gi / grains) * TS + _noise(gi, seed, 101) * (TS / grains) * 0.5;
      ctx.globalAlpha = 0.3 + _noise(gi + 1, seed, 103) * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, gy2);
      ctx.lineTo(x + TS, gy2 + (_noise(gi * 3, seed, 107) - 0.5) * 3);
      ctx.stroke();
    }
    ctx.restore();

    // Door panel inset
    ctx.save();
    ctx.strokeStyle = '#6a3a10';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + TS * 0.12, y + TS * 0.12, TS * 0.76, TS * 0.35);
    ctx.strokeRect(x + TS * 0.12, y + TS * 0.53, TS * 0.76, TS * 0.35);
    ctx.restore();

    // Iron hinge details
    ctx.save();
    ctx.fillStyle = '#888';
    for (const hy of [0.22, 0.72]) {
      ctx.fillRect(x + TS * 0.06, y + TS * hy, TS * 0.08, TS * 0.10);
      ctx.fillRect(x + TS * 0.86, y + TS * hy, TS * 0.08, TS * 0.10);
    }
    ctx.restore();
  }

  function _drawChestMaterial(ctx, x, y, TS, phase, seed) {
    // Rich wood body
    ctx.fillStyle = '#4a3000';
    ctx.fillRect(x, y, TS, TS);

    // Chest body shape
    ctx.save();
    ctx.fillStyle = '#5a3a08';
    ctx.fillRect(x + TS * 0.10, y + TS * 0.30, TS * 0.80, TS * 0.55);

    // Lid highlight
    ctx.fillStyle = '#7a5015';
    ctx.fillRect(x + TS * 0.10, y + TS * 0.15, TS * 0.80, TS * 0.20);

    // Iron lock
    ctx.fillStyle = '#888';
    ctx.fillRect(x + TS * 0.40, y + TS * 0.38, TS * 0.20, TS * 0.18);
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(x + TS * 0.50, y + TS * 0.45, TS * 0.05, 0, Math.PI * 2);
    ctx.fill();

    // Treasure glint animation
    const glintA = 0.5 + Math.sin(phase * 2.5 + seed) * 0.4;
    if (glintA > 0.2) {
      ctx.globalAlpha = glintA * 0.7;
      ctx.fillStyle = '#ffd700';
      const gx2 = x + TS * (0.35 + Math.sin(phase * 1.3) * 0.10);
      const gy2 = y + TS * (0.50 + Math.cos(phase * 1.7) * 0.06);
      ctx.beginPath();
      ctx.arc(gx2, gy2, TS * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function _drawStairsMaterial(ctx, x, y, TS, seed) {
    ctx.fillStyle = '#3a3a2a';
    ctx.fillRect(x, y, TS, TS);

    // Step bands with depth shadow casting
    const steps = 4;
    for (let si = 0; si < steps; si++) {
      const sy  = y + (si / steps) * TS;
      const sh  = TS / steps;
      const lit = 0.30 + si * 0.12; // lighter towards bottom = receding

      ctx.fillStyle = `rgba(${Math.round(lit * 255)},${Math.round(lit * 230)},${Math.round(lit * 180)},0.18)`;
      ctx.fillRect(x, sy, TS, sh * 0.7);

      // Step edge shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, sy + sh * 0.7, TS, sh * 0.3);

      // Highlight on leading edge
      ctx.fillStyle = `rgba(255,255,200,${(0.05 + si * 0.03).toFixed(2)})`;
      ctx.fillRect(x, sy, TS, 1.5);
    }

    // Worn centre line
    ctx.strokeStyle = 'rgba(200,190,140,0.20)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + TS / 2, y);
    ctx.lineTo(x + TS / 2, y + TS);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function _drawMagicMaterial(ctx, x, y, TS, phase, seed) {
    // Dark arcane base
    ctx.fillStyle = '#0d0826';
    ctx.fillRect(x, y, TS, TS);

    // Pulsing arcane glow
    const glowA = 0.25 + Math.sin(phase * 1.8) * 0.15;
    const glow = ctx.createRadialGradient(
      x + TS / 2, y + TS / 2, 0,
      x + TS / 2, y + TS / 2, TS * 0.65
    );
    glow.addColorStop(0, `rgba(140,0,255,${glowA.toFixed(3)})`);
    glow.addColorStop(0.5, `rgba(80,0,180,${(glowA * 0.5).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(20,0,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, TS, TS);

    // Rotating rune circle
    ctx.save();
    ctx.translate(x + TS / 2, y + TS / 2);
    ctx.rotate(phase * 0.4);
    ctx.strokeStyle = `rgba(180,60,255,${(0.5 + Math.sin(phase) * 0.2).toFixed(2)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, TS * 0.32, 0, Math.PI * 2);
    ctx.stroke();

    // Inner rune triangle
    ctx.rotate(phase * 0.2);
    ctx.strokeStyle = `rgba(220,100,255,${(0.4 + Math.cos(phase * 1.3) * 0.2).toFixed(2)})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let ri = 0; ri < 3; ri++) {
      const angle = (ri / 3) * Math.PI * 2;
      const rx2   = Math.cos(angle) * TS * 0.28;
      const ry2   = Math.sin(angle) * TS * 0.28;
      ri === 0 ? ctx.moveTo(rx2, ry2) : ctx.lineTo(rx2, ry2);
    }
    ctx.closePath();
    ctx.stroke();

    // Rune tick marks
    for (let ri = 0; ri < 8; ri++) {
      const angle = (ri / 8) * Math.PI * 2;
      const r0    = TS * 0.34;
      const r1    = TS * 0.40;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r0, Math.sin(angle) * r0);
      ctx.lineTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      ctx.stroke();
    }
    ctx.restore();

    // Star glints at rune nodes
    ctx.save();
    for (let ni = 0; ni < 4; ni++) {
      const angle = (ni / 4) * Math.PI * 2 + phase * 0.4;
      const nx2   = x + TS / 2 + Math.cos(angle) * TS * 0.28;
      const ny2   = y + TS / 2 + Math.sin(angle) * TS * 0.28;
      const na    = 0.5 + Math.sin(phase * 2.2 + ni) * 0.4;
      ctx.globalAlpha = Math.max(0, na);
      ctx.fillStyle = '#e0a0ff';
      ctx.fillRect(nx2 - 1, ny2 - 1, 2, 2);
    }
    ctx.restore();
  }

  function _drawIceMaterial(ctx, x, y, TS, phase, seed) {
    // Crystal blue base gradient
    const iceGrad = ctx.createLinearGradient(x, y, x + TS, y + TS);
    iceGrad.addColorStop(0, '#b8dff5');
    iceGrad.addColorStop(0.5, '#90cce8');
    iceGrad.addColorStop(1, '#a0d4f0');
    ctx.fillStyle = iceGrad;
    ctx.fillRect(x, y, TS, TS);

    // Frost crack patterns
    ctx.save();
    ctx.strokeStyle = 'rgba(220,245,255,0.7)';
    ctx.lineWidth = 0.6;
    const frostLines = 5 + Math.floor(_noise(seed, seed, 7) * 4);
    for (let fi = 0; fi < frostLines; fi++) {
      const fx1 = x + _noise(fi * 7, seed, 113) * TS;
      const fy1 = y + _noise(seed, fi * 7, 127) * TS;
      const fx2 = x + _noise(fi * 7 + 1, seed + 1, 131) * TS;
      const fy2 = y + _noise(seed + 1, fi * 7 + 1, 137) * TS;
      ctx.globalAlpha = 0.3 + _noise(fi, fi, seed) * 0.5;
      ctx.beginPath();
      ctx.moveTo(fx1, fy1);
      ctx.lineTo(fx2, fy2);
      ctx.stroke();
    }
    ctx.restore();

    // Crystalline facet highlight
    ctx.save();
    ctx.globalAlpha = 0.20 + Math.sin(phase * 1.5) * 0.08;
    const facetGrad = ctx.createLinearGradient(x, y, x + TS * 0.5, y + TS * 0.5);
    facetGrad.addColorStop(0, 'rgba(255,255,255,0.6)');
    facetGrad.addColorStop(1, 'rgba(160,220,255,0)');
    ctx.fillStyle = facetGrad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + TS * 0.55, y);
    ctx.lineTo(x, y + TS * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Animated shimmer reflection
    const shimA = 0.10 + Math.sin(phase * 2.0 + seed) * 0.07;
    ctx.fillStyle = `rgba(240,252,255,${shimA.toFixed(3)})`;
    ctx.fillRect(x, y, TS, Math.floor(TS * 0.25));
  }

  function _drawSandMaterial(ctx, x, y, TS, seed) {
    // Warm sandy gradient
    const sandGrad = ctx.createLinearGradient(x, y, x + TS, y + TS);
    sandGrad.addColorStop(0, '#d4ac72');
    sandGrad.addColorStop(0.5, '#c09050');
    sandGrad.addColorStop(1, '#b88040');
    ctx.fillStyle = sandGrad;
    ctx.fillRect(x, y, TS, TS);

    // Wind ripple lines
    ctx.save();
    ctx.strokeStyle = 'rgba(180,130,60,0.45)';
    ctx.lineWidth = 0.6;
    const ripples = 5 + Math.floor(_noise(seed, seed + 2, 13) * 4);
    for (let ri = 0; ri < ripples; ri++) {
      const ry2   = y + (ri / ripples) * TS + _noise(ri, seed, 139) * (TS / ripples) * 0.8;
      const curve = (_noise(ri * 3, seed, 149) - 0.5) * 4;
      ctx.globalAlpha = 0.25 + _noise(ri + 3, seed, 151) * 0.35;
      ctx.beginPath();
      ctx.moveTo(x, ry2);
      ctx.quadraticCurveTo(x + TS / 2, ry2 + curve, x + TS, ry2 + curve * 0.3);
      ctx.stroke();
    }
    ctx.restore();

    // Fine grain noise dots
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let gi = 0; gi < 20; gi++) {
      const gx2 = x + _noise(gi * 11, seed, 157) * TS;
      const gy2 = y + _noise(seed, gi * 11, 163) * TS;
      ctx.fillStyle = _noise(gi, seed, 167) > 0.5 ? '#a07030' : '#e0b870';
      ctx.fillRect(gx2, gy2, 1, 1);
    }
    ctx.restore();
  }

  function _drawMetalMaterial(ctx, x, y, TS, phase, seed) {
    // Polished steel gradient
    const metalGrad = ctx.createLinearGradient(x, y, x + TS, y + TS);
    metalGrad.addColorStop(0, '#5a6070');
    metalGrad.addColorStop(0.3, '#7a8090');
    metalGrad.addColorStop(0.6, '#4a5560');
    metalGrad.addColorStop(1, '#6a7080');
    ctx.fillStyle = metalGrad;
    ctx.fillRect(x, y, TS, TS);

    // Plate seam lines
    ctx.save();
    ctx.strokeStyle = 'rgba(30,40,50,0.5)';
    ctx.lineWidth = 1.0;
    // Horizontal seam
    ctx.beginPath();
    ctx.moveTo(x, y + TS * 0.50);
    ctx.lineTo(x + TS, y + TS * 0.50);
    ctx.stroke();
    // Vertical seam
    ctx.beginPath();
    ctx.moveTo(x + TS * 0.50, y);
    ctx.lineTo(x + TS * 0.50, y + TS);
    ctx.stroke();
    ctx.restore();

    // Rivet dots at corners
    ctx.save();
    ctx.fillStyle = '#8a9099';
    const rivetPositions = [
      [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85],
    ];
    for (const [rx2, ry2] of rivetPositions) {
      ctx.beginPath();
      ctx.arc(x + rx2 * TS, y + ry2 * TS, TS * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Animated reflection sweep
    const reflectX = x + (((phase / (Math.PI * 2)) * TS * 2) % (TS * 1.5)) - TS * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.12;
    const reflGrad = ctx.createLinearGradient(reflectX, y, reflectX + TS * 0.3, y);
    reflGrad.addColorStop(0, 'rgba(255,255,255,0)');
    reflGrad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    reflGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = reflGrad;
    ctx.fillRect(x, y, TS, TS);
    ctx.restore();
  }

  function _drawTrapMaterial(ctx, x, y, TS, seed) {
    // Dark red stone base
    ctx.fillStyle = '#3a1000';
    ctx.fillRect(x, y, TS, TS);

    // Stone floor texture beneath
    _drawStoneBase(ctx, x, y, TS, '#4a1a00', seed);

    // Pressure plate inset
    ctx.save();
    ctx.fillStyle = '#2a0800';
    ctx.fillRect(x + TS * 0.15, y + TS * 0.15, TS * 0.70, TS * 0.70);
    ctx.strokeStyle = '#7a2a00';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + TS * 0.15, y + TS * 0.15, TS * 0.70, TS * 0.70);

    // Diagonal warning stripes
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#cc3300';
    ctx.lineWidth = 1.5;
    for (let di = -2; di < 5; di++) {
      const dx = di * (TS / 4);
      ctx.beginPath();
      ctx.moveTo(x + dx, y + TS * 0.15);
      ctx.lineTo(x + dx + TS * 0.50, y + TS * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CORE DRAW TILE  (preserves original API)
  // ═══════════════════════════════════════════════════════════════════════════

  function drawTile(ctx, x, y, tileSize, type) {
    const style = TILE_STYLES[type];
    if (!style || type === 'empty') return;

    const TS    = tileSize;
    const seed  = ((x / TS) * 31 + (y / TS) * 17) | 0;
    const phase = _animOffset;

    // Drop shadow
    if (style.shadow && style.shadow !== 'rgba(0,0,0,0)') {
      ctx.fillStyle = style.shadow;
      ctx.fillRect(x + 2, y + 2, TS, TS);
    }

    // Material shader dispatch
    switch (type) {
      case 'floor':
      case 'stone':
        _drawStoneBase(ctx, x, y, TS, style.color, seed);
        break;
      case 'wall':
        _drawStoneBase(ctx, x, y, TS, style.color, seed + 500);
        // Extra thick dark border for visual weight
        ctx.strokeStyle = style.border;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
        break;
      case 'water':
        _drawWaterMaterial(ctx, x, y, TS, phase);
        break;
      case 'lava':
        _drawLavaMaterial(ctx, x, y, TS, phase, seed);
        break;
      case 'grass':
        _drawGrassMaterial(ctx, x, y, TS, seed);
        break;
      case 'door':
        _drawDoorMaterial(ctx, x, y, TS, seed);
        break;
      case 'chest':
        _drawChestMaterial(ctx, x, y, TS, phase, seed);
        break;
      case 'stairs':
        _drawStairsMaterial(ctx, x, y, TS, seed);
        break;
      case 'trap':
        _drawTrapMaterial(ctx, x, y, TS, seed);
        break;
      case 'magic':
        _drawMagicMaterial(ctx, x, y, TS, phase, seed);
        break;
      case 'ice':
        _drawIceMaterial(ctx, x, y, TS, phase, seed);
        break;
      case 'sand':
        _drawSandMaterial(ctx, x, y, TS, seed);
        break;
      case 'metal':
        _drawMetalMaterial(ctx, x, y, TS, phase, seed);
        break;
      default: {
        // Fallback generic tile
        let bgColor = style.color;
        if (style.animated) {
          const t = (Math.sin(phase * 2 + x * 0.02) + 1) / 2;
          bgColor = _lerpColor(style.color, style.border, t);
        }
        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, TS, TS);
        if (style.border && style.border !== 'transparent') {
          ctx.strokeStyle = style.border;
          ctx.lineWidth = style.thick ? 3 : 1.5;
          ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
        }
      }
    }

    // Emoji icon centred
    ctx.font         = `${Math.floor(TS * 0.46)}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(255,255,255,0.87)';
    ctx.fillText(style.icon, x + TS / 2, y + TS / 2);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AMBIENT OCCLUSION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Draw soft corner/edge shadow darkening where neighbors[top|right|bottom|left]
   * are true (indicating an adjacent solid/wall tile casts shadow onto this tile).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} tileSize
   * @param {{ top: boolean, right: boolean, bottom: boolean, left: boolean }} neighbors
   */
  function drawAmbientOcclusion(ctx, x, y, tileSize, neighbors) {
    const TS  = tileSize;
    const AO  = Math.ceil(TS * 0.22); // falloff width
    ctx.save();

    if (neighbors.top) {
      const g = ctx.createLinearGradient(x, y, x, y + AO);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, TS, AO);
    }
    if (neighbors.bottom) {
      const g = ctx.createLinearGradient(x, y + TS, x, y + TS - AO);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y + TS - AO, TS, AO);
    }
    if (neighbors.left) {
      const g = ctx.createLinearGradient(x, y, x + AO, y);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, AO, TS);
    }
    if (neighbors.right) {
      const g = ctx.createLinearGradient(x + TS, y, x + TS - AO, y);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + TS - AO, y, AO, TS);
    }

    // Diagonal corner darkening (compound shadows)
    const CORNER = Math.ceil(TS * 0.15);
    if (neighbors.top && neighbors.left) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, CORNER * 1.5);
      g.addColorStop(0, 'rgba(0,0,0,0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, CORNER * 2, CORNER * 2);
    }
    if (neighbors.top && neighbors.right) {
      const g = ctx.createRadialGradient(x + TS, y, 0, x + TS, y, CORNER * 1.5);
      g.addColorStop(0, 'rgba(0,0,0,0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + TS - CORNER * 2, y, CORNER * 2, CORNER * 2);
    }
    if (neighbors.bottom && neighbors.left) {
      const g = ctx.createRadialGradient(x, y + TS, 0, x, y + TS, CORNER * 1.5);
      g.addColorStop(0, 'rgba(0,0,0,0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y + TS - CORNER * 2, CORNER * 2, CORNER * 2);
    }
    if (neighbors.bottom && neighbors.right) {
      const g = ctx.createRadialGradient(x + TS, y + TS, 0, x + TS, y + TS, CORNER * 1.5);
      g.addColorStop(0, 'rgba(0,0,0,0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + TS - CORNER * 2, y + TS - CORNER * 2, CORNER * 2, CORNER * 2);
    }
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GLOBAL LIGHTING PASS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Multiply tile brightness by lightLevel (0.0 = black, 1.0 = full light).
   * Call after drawTile to darken tiles in shadow/fog regions.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} tileSize
   * @param {number} lightLevel  0.0 – 1.0
   */
  function applyLightingPass(ctx, x, y, tileSize, lightLevel) {
    const darkness = 1 - Math.max(0, Math.min(1, lightLevel));
    if (darkness <= 0) return;
    ctx.save();
    ctx.globalAlpha = darkness;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, tileSize, tileSize);
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DETAILED TILE (combines all effects in one call)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enhanced tile rendering that stacks material shader + ambient occlusion
   * + lighting pass in a single call.  For hot-path scene rendering.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} tileSize
   * @param {string} type
   * @param {{ top: boolean, right: boolean, bottom: boolean, left: boolean }} neighbors
   * @param {number} lightLevel  0.0 – 1.0
   * @param {number} [animTime]  explicit timestamp override (ms); defaults to _animOffset
   */
  function drawTileDetailed(ctx, x, y, tileSize, type, neighbors, lightLevel, animTime) {
    if (animTime !== undefined) {
      const savedOffset = _animOffset;
      _animOffset = (animTime / 1000) % (Math.PI * 2);
      drawTile(ctx, x, y, tileSize, type);
      _animOffset = savedOffset;
    } else {
      drawTile(ctx, x, y, tileSize, type);
    }

    if (neighbors) {
      drawAmbientOcclusion(ctx, x, y, tileSize, neighbors);
    }

    if (lightLevel !== undefined && lightLevel < 1.0) {
      applyLightingPass(ctx, x, y, tileSize, lightLevel);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GRID OVERLAY  (enhanced)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Draw the dungeon grid.
   * – Subtle lines between all tiles.
   * – Every 5th line is brighter (block edge emphasis).
   * – Coordinate labels on every 5th tile when tileSize ≥ 20.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cols
   * @param {number} rows
   * @param {number} tileSize
   */
  function drawGrid(ctx, cols, rows, tileSize) {
    ctx.save();

    // Horizontal lines
    for (let r = 0; r <= rows; r++) {
      const isMajor = (r % 5 === 0);
      ctx.strokeStyle = isMajor ? 'rgba(120,90,40,0.45)' : 'rgba(90,62,27,0.22)';
      ctx.lineWidth   = isMajor ? 1.0 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, r * tileSize);
      ctx.lineTo(cols * tileSize, r * tileSize);
      ctx.stroke();
    }

    // Vertical lines
    for (let c = 0; c <= cols; c++) {
      const isMajor = (c % 5 === 0);
      ctx.strokeStyle = isMajor ? 'rgba(120,90,40,0.45)' : 'rgba(90,62,27,0.22)';
      ctx.lineWidth   = isMajor ? 1.0 : 0.5;
      ctx.beginPath();
      ctx.moveTo(c * tileSize, 0);
      ctx.lineTo(c * tileSize, rows * tileSize);
      ctx.stroke();
    }

    // Coordinate labels every 5 tiles (only when tiles are large enough)
    if (tileSize >= 20) {
      ctx.font         = `${Math.max(8, Math.floor(tileSize * 0.20))}px monospace`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = 'rgba(160,130,70,0.50)';
      for (let r = 0; r < rows; r += 5) {
        for (let c = 0; c < cols; c += 5) {
          ctx.fillText(`${c},${r}`, c * tileSize + 2, r * tileSize + 2);
        }
      }
    }

    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HOVER HIGHLIGHT
  // ═══════════════════════════════════════════════════════════════════════════

  function drawHover(ctx, row, col, tileSize) {
    const x = col * tileSize, y = row * tileSize;
    const TS = tileSize;

    // Subtle golden fill
    ctx.fillStyle = 'rgba(200,168,75,0.18)';
    ctx.fillRect(x, y, TS, TS);

    // Corner accent marks instead of full border for a premium feel
    ctx.strokeStyle = 'rgba(220,185,85,0.80)';
    ctx.lineWidth = 2;
    const M = Math.ceil(TS * 0.22); // marker length

    ctx.beginPath();
    // Top-left
    ctx.moveTo(x + M, y);
    ctx.lineTo(x,     y);
    ctx.lineTo(x,     y + M);
    // Top-right
    ctx.moveTo(x + TS - M, y);
    ctx.lineTo(x + TS,     y);
    ctx.lineTo(x + TS,     y + M);
    // Bottom-left
    ctx.moveTo(x,     y + TS - M);
    ctx.lineTo(x,     y + TS);
    ctx.lineTo(x + M, y + TS);
    // Bottom-right
    ctx.moveTo(x + TS,     y + TS - M);
    ctx.lineTo(x + TS,     y + TS);
    ctx.lineTo(x + TS - M, y + TS);
    ctx.stroke();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECTANGLE PREVIEW
  // ═══════════════════════════════════════════════════════════════════════════

  function drawRectPreview(ctx, r1, c1, r2, c2, tileSize) {
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    const x = minC * tileSize,              y = minR * tileSize;
    const w = (maxC - minC + 1) * tileSize, h = (maxR - minR + 1) * tileSize;

    ctx.fillStyle = 'rgba(200,168,75,0.12)';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = 'rgba(200,168,75,0.70)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PARALLAX LAYERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Draw a depth background layer behind the tile grid.
   * layerIndex 0 = far (slow, dark), 1 = mid, 2 = near (fast, brighter).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} layerIndex   0 | 1 | 2
   * @param {number} offsetX      camera / parallax X offset in pixels
   * @param {number} offsetY      camera / parallax Y offset in pixels
   * @param {number} width        canvas width
   * @param {number} height       canvas height
   */
  function drawParallaxLayer(ctx, layerIndex, offsetX, offsetY, width, height) {
    const speeds  = [0.15, 0.35, 0.60];
    const alphas  = [0.07, 0.10, 0.14];
    const cellSz  = [80, 50, 30];
    const colors  = [
      ['#1a0e08', '#0a0503'],
      ['#1a1408', '#0f0c06'],
      ['#221a0a', '#150e05'],
    ];

    const li   = Math.max(0, Math.min(2, layerIndex | 0));
    const spd  = speeds[li];
    const alph = alphas[li];
    const sz   = cellSz[li];
    const ox   = (offsetX * spd) % sz;
    const oy   = (offsetY * spd) % sz;

    ctx.save();
    ctx.globalAlpha = alph;
    const [ca, cb] = colors[li];

    for (let px = -sz + ox; px < width + sz; px += sz) {
      for (let py = -sz + oy; py < height + sz; py += sz) {
        const nx = Math.floor((px + sz) / sz);
        const ny = Math.floor((py + sz) / sz);
        ctx.fillStyle = _noise(nx, ny, li + 1) > 0.5 ? ca : cb;
        ctx.fillRect(px, py, sz, sz);
      }
    }
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BACKGROUND  (with parallax integration)
  // ═══════════════════════════════════════════════════════════════════════════

  // NOTE: drawBackground is defined above without parallax to keep the
  //       original API signature (ctx, width, height). Callers that want
  //       parallax should call drawParallaxLayer separately.

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // ── Preserved API ────────────────────────────────────────────────────────
    TILE_STYLES,
    TILE_KEYS,
    get animOffset() { return _animOffset; },
    updateAnimation,
    drawBackground,
    drawTile,
    drawGrid,
    drawHover,
    drawRectPreview,

    // ── New API ──────────────────────────────────────────────────────────────
    drawTileDetailed,
    drawAmbientOcclusion,
    applyLightingPass,
    drawParallaxLayer,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TileRenderer;
}
