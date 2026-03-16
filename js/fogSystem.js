/**
 * fogSystem.js – Fog of War & Line of Sight
 *
 * fogState = {
 *   enabled:       boolean,
 *   revealedTiles: Set<string>,   // "row,col" – explored but possibly out of sight
 *   visibleTiles:  Set<string>,   // "row,col" – currently in line of sight
 * }
 *
 * Visibility levels per tile:
 *   'visible'  – in current line of sight          → fully bright
 *   'explored' – explored before, now out of sight → dimmed overlay
 *   'hidden'   – never explored                    → dark overlay
 *
 * Line of sight uses a simple ray-casting algorithm:
 *   – Rays fan out 360° from every token position.
 *   – A ray stops when it hits a vision-blocking tile (walls).
 *   – All tiles touched by unblocked rays become visible.
 */

const FogSystem = (() => {
  'use strict';

  // Default vision radius in grid cells
  const DEFAULT_VISION_RADIUS = 6;

  // How many angular steps for the ray fan (higher = smoother but slower)
  const RAY_STEPS = 360;

  const fogState = {
    enabled:       false,
    revealedTiles: new Set(),
    visibleTiles:  new Set(),
  };

  let _mapWidth       = 20;
  let _mapHeight      = 15;
  let _getTile        = null;   // (row, col) => tile | null

  // ── Initialise ──────────────────────────────────────────────────────────────

  function init(mapWidth, mapHeight, getTileFn) {
    _mapWidth  = mapWidth;
    _mapHeight = mapHeight;
    _getTile   = getTileFn;
    resetFog();
  }

  function setMapSize(w, h) {
    _mapWidth  = Math.max(1, w);
    _mapHeight = Math.max(1, h);
  }

  // ── Enable / Disable ────────────────────────────────────────────────────────

  function setEnabled(enabled) {
    fogState.enabled = Boolean(enabled);
    if (!enabled) {
      fogState.visibleTiles.clear();
      fogState.revealedTiles.clear();
    }
  }

  function resetFog() {
    fogState.revealedTiles.clear();
    fogState.visibleTiles.clear();
  }

  // ── Visibility Update ────────────────────────────────────────────────────────

  /**
   * Recompute visible tiles from all provided token positions.
   * @param {Array<{x: number, y: number}>} tokens  – tokens with grid x (col) and y (row)
   * @param {number} [visionRadius]
   */
  function updateVisibility(tokens, visionRadius) {
    const radius = (visionRadius !== undefined) ? visionRadius : DEFAULT_VISION_RADIUS;
    fogState.visibleTiles.clear();

    for (const token of tokens) {
      _castRays(token.y, token.x, radius);
    }

    // Any newly visible tile is also marked as revealed (explored)
    for (const key of fogState.visibleTiles) {
      fogState.revealedTiles.add(key);
    }
  }

  // ── Ray Casting ──────────────────────────────────────────────────────────────

  function _castRays(originRow, originCol, radius) {
    // The origin cell is always visible
    _markVisible(originRow, originCol);

    for (let i = 0; i < RAY_STEPS; i++) {
      const angle = (i / RAY_STEPS) * Math.PI * 2;
      _castRay(originRow, originCol, angle, radius);
    }
  }

  /**
   * Cast a single ray in the given direction.
   * Steps along the ray at half-tile resolution for accuracy.
   */
  function _castRay(originRow, originCol, angle, radius) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // Start from the centre of the origin cell
    let wx = originCol + 0.5;
    let wy = originRow + 0.5;

    // Step size in world units (0.5 ≈ half a tile for accuracy)
    const STEP = 0.5;
    const steps = Math.ceil(radius / STEP);

    for (let s = 1; s <= steps; s++) {
      wx += dx * STEP;
      wy += dy * STEP;

      const col = Math.floor(wx);
      const row = Math.floor(wy);

      if (row < 0 || row >= _mapHeight || col < 0 || col >= _mapWidth) break;

      _markVisible(row, col);

      if (_blocksVision(row, col)) break;
    }
  }

  function _markVisible(row, col) {
    const key = `${row},${col}`;
    fogState.visibleTiles.add(key);
    fogState.revealedTiles.add(key);
  }

  function _blocksVision(row, col) {
    if (!_getTile) return false;
    const tile = _getTile(row, col);
    if (!tile || !tile.type) return false;
    return tile.type === 'wall';
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  /**
   * Returns the fog level for a tile cell.
   * @returns {'visible' | 'explored' | 'hidden'}
   */
  function getFogLevel(row, col) {
    if (!fogState.enabled) return 'visible';
    const key = `${row},${col}`;
    if (fogState.visibleTiles.has(key))  return 'visible';
    if (fogState.revealedTiles.has(key)) return 'explored';
    return 'hidden';
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  /**
   * Draw the fog overlay onto the canvas context.
   * Must be called after tiles and tokens have been drawn.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} mapWidth   – columns
   * @param {number} mapHeight  – rows
   * @param {number} tileSize   – pixels per tile
   */
  function drawFog(ctx, mapWidth, mapHeight, tileSize) {
    if (!fogState.enabled) return;

    for (let r = 0; r < mapHeight; r++) {
      for (let c = 0; c < mapWidth; c++) {
        const level = getFogLevel(r, c);
        if (level === 'visible') continue;

        const x = c * tileSize;
        const y = r * tileSize;

        ctx.fillStyle = (level === 'hidden')
          ? 'rgba(0,0,0,0.92)'   // unexplored – near black
          : 'rgba(0,0,0,0.55)';  // explored   – dimmed
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }

  // ── Serialise / Deserialise ───────────────────────────────────────────────────

  function serialize() {
    return {
      enabled:       fogState.enabled,
      revealedTiles: Array.from(fogState.revealedTiles),
    };
  }

  function deserialize(data) {
    if (!data) return;
    fogState.enabled       = Boolean(data.enabled);
    fogState.revealedTiles = new Set(data.revealedTiles || []);
    fogState.visibleTiles.clear();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return {
    get fogState()           { return fogState; },
    get enabled()            { return fogState.enabled; },
    DEFAULT_VISION_RADIUS,
    init,
    setMapSize,
    setEnabled,
    resetFog,
    updateVisibility,
    getFogLevel,
    drawFog,
    serialize,
    deserialize,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FogSystem;
}
