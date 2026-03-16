/**
 * tileRenderer.js – Tile Visual Rendering
 * Defines tile visual styles and provides canvas drawing functions.
 * Supports animated tiles (water shimmer, lava glow) and dungeon atmosphere.
 */

const TileRenderer = (() => {
  'use strict';

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
    empty: {
      label: 'Erase', icon: '❌',
      color: 'transparent', border: 'transparent',
      walkable: true,
    },
  };

  const TILE_KEYS = Object.keys(TILE_STYLES).filter(k => k !== 'empty');

  let _animOffset = 0;   // updated by the render loop (seconds, 0 – 2π)

  // ── Animation clock (called each rAF frame) ─────────────────────────────────

  function updateAnimation(timestamp) {
    _animOffset = (timestamp / 1000) % (Math.PI * 2);
  }

  // ── Background ──────────────────────────────────────────────────────────────

  function drawBackground(ctx, width, height) {
    // Flat dark fill
    ctx.fillStyle = '#0a0805';
    ctx.fillRect(0, 0, width, height);

    // Subtle radial vignette for dungeon atmosphere
    const grad = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.20,
      width / 2, height / 2, Math.max(width, height) * 0.80
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // ── Single tile ─────────────────────────────────────────────────────────────

  function drawTile(ctx, x, y, tileSize, type) {
    const style = TILE_STYLES[type];
    if (!style || type === 'empty') return;

    const TS = tileSize;

    // Compute animated colour
    let bgColor = style.color;
    if (style.animated) {
      const phase = _animOffset * 2 + x * 0.02;
      const t     = (Math.sin(phase) + 1) / 2;            // 0 – 1
      bgColor = type === 'lava'
        ? _lerpColor('#5a1a00', '#8a3500', t)
        : _lerpColor('#1a3a5a', '#1e4e7a', t);
    }

    // Drop shadow (offset pixel block)
    if (style.shadow) {
      ctx.fillStyle = style.shadow;
      ctx.fillRect(x + 2, y + 2, TS, TS);
    }

    // Main tile fill
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, TS, TS);

    // Inner border
    if (style.border !== 'transparent') {
      ctx.strokeStyle = style.border;
      ctx.lineWidth   = style.thick ? 3 : 1.5;
      ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
    }

    // Lava radial glow
    if (style.glowing) {
      const glow = ctx.createRadialGradient(
        x + TS / 2, y + TS / 2, 0,
        x + TS / 2, y + TS / 2, TS * 0.72
      );
      const a = 0.20 + Math.sin(_animOffset * 3 + x * 0.05) * 0.15;
      glow.addColorStop(0, `rgba(255,100,0,${a.toFixed(2)})`);
      glow.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, y, TS, TS);
    }

    // Water shimmer strip
    if (style.shimmer) {
      const a = 0.07 + Math.sin(_animOffset * 2 + x * 0.05) * 0.05;
      ctx.fillStyle = `rgba(120,200,255,${a.toFixed(2)})`;
      ctx.fillRect(x, y, TS, Math.floor(TS * 0.35));
    }

    // Emoji icon centred
    ctx.font         = `${Math.floor(TS * 0.46)}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(255,255,255,0.87)';
    ctx.fillText(style.icon, x + TS / 2, y + TS / 2);
  }

  // ── Grid overlay ─────────────────────────────────────────────────────────────

  function drawGrid(ctx, cols, rows, tileSize) {
    ctx.strokeStyle = 'rgba(90,62,27,0.30)';
    ctx.lineWidth   = 0.5;

    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0,             r * tileSize);
      ctx.lineTo(cols * tileSize, r * tileSize);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * tileSize, 0);
      ctx.lineTo(c * tileSize, rows * tileSize);
      ctx.stroke();
    }
  }

  // ── Hover highlight ──────────────────────────────────────────────────────────

  function drawHover(ctx, row, col, tileSize) {
    ctx.fillStyle   = 'rgba(200,168,75,0.18)';
    ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
    ctx.strokeStyle = 'rgba(200,168,75,0.55)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(col * tileSize, row * tileSize, tileSize, tileSize);
  }

  // ── Rectangle preview (while dragging Rect tool) ─────────────────────────────

  function drawRectPreview(ctx, r1, c1, r2, c2, tileSize) {
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    const x = minC * tileSize,           y = minR * tileSize;
    const w = (maxC - minC + 1) * tileSize, h = (maxR - minR + 1) * tileSize;

    ctx.fillStyle = 'rgba(200,168,75,0.12)';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = 'rgba(200,168,75,0.70)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  // ── Utility ──────────────────────────────────────────────────────────────────

  function _lerpColor(hex1, hex2, t) {
    const r1 = parseInt(hex1.slice(1, 3), 16);
    const g1 = parseInt(hex1.slice(3, 5), 16);
    const b1 = parseInt(hex1.slice(5, 7), 16);
    const r2 = parseInt(hex2.slice(1, 3), 16);
    const g2 = parseInt(hex2.slice(3, 5), 16);
    const b2 = parseInt(hex2.slice(5, 7), 16);
    return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
  }

  return {
    TILE_STYLES,
    TILE_KEYS,
    get animOffset() { return _animOffset; },
    updateAnimation,
    drawBackground,
    drawTile,
    drawGrid,
    drawHover,
    drawRectPreview,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TileRenderer;
}
