/**
 * fogOfWar.js – Fog of War & Line of Sight
 *
 * Grid-based fog-of-war system with three states per cell: UNSEEN,
 * EXPLORED, and VISIBLE. Uses recursive shadow-casting for line-of-sight
 * computation and renders a translucent overlay with soft edges.
 *
 * @module FogOfWar
 */

const FogOfWar = (() => {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────

  const UNSEEN   = 0;
  const EXPLORED = 1;
  const VISIBLE  = 2;

  /** Shadow-casting octant multipliers. */
  const _OCTANTS = [
    [ 1, 0, 0, 1],  [ 0, 1, 1, 0],
    [ 0,-1, 1, 0],  [-1, 0, 0, 1],
    [-1, 0, 0,-1],  [ 0,-1,-1, 0],
    [ 0, 1,-1, 0],  [ 1, 0, 0,-1],
  ];

  // ── State ───────────────────────────────────────────────────────────────

  let _width    = 0;
  let _height   = 0;
  let _enabled  = true;

  /** Fog grid: row-major, _fog[row * _width + col]. */
  let _fog      = null;

  /** Blocker grid: true if cell blocks vision. */
  let _blockers = null;

  /**
   * Vision sources: id → { id, col, row, radius, darkvision }
   * @type {Map<*, Object>}
   */
  const _visionSources = new Map();

  // ── Helpers ─────────────────────────────────────────────────────────────

  function _inBounds(row, col) {
    return row >= 0 && row < _height && col >= 0 && col < _width;
  }

  function _idx(row, col) { return row * _width + col; }

  // ── Shadow casting (recursive) ──────────────────────────────────────────

  /**
   * Cast light in one octant using recursive shadow-casting.
   * @param {number} cx - Source column.
   * @param {number} cy - Source row.
   * @param {number} radius
   * @param {number} startSlope
   * @param {number} endSlope
   * @param {number} xx - Octant multiplier.
   * @param {number} xy - Octant multiplier.
   * @param {number} yx - Octant multiplier.
   * @param {number} yy - Octant multiplier.
   * @param {number} depth
   */
  function _castOctant(cx, cy, radius, startSlope, endSlope, xx, xy, yx, yy, depth) {
    if (startSlope < endSlope) return;

    const radiusSq = radius * radius;
    let nextStart  = startSlope;

    for (let i = depth; i <= radius; i++) {
      let blocked = false;
      let dStart  = nextStart;

      for (let dx = -i; dx <= 0; dx++) {
        const dy = -i;
        const mapCol = cx + dx * xx + dy * xy;
        const mapRow = cy + dx * yx + dy * yy;

        const leftSlope  = (dx - 0.5) / (dy + 0.5);
        const rightSlope = (dx + 0.5) / (dy - 0.5);

        if (rightSlope > dStart) continue;
        if (leftSlope < endSlope) break;

        // Mark visible if within radius
        const distSq = dx * dx + dy * dy;
        if (distSq <= radiusSq && _inBounds(mapRow, mapCol)) {
          _fog[_idx(mapRow, mapCol)] = VISIBLE;
        }

        if (blocked) {
          if (_inBounds(mapRow, mapCol) && _blockers[_idx(mapRow, mapCol)]) {
            nextStart = rightSlope;
          } else {
            blocked = false;
            dStart  = nextStart;
          }
        } else if (_inBounds(mapRow, mapCol) && _blockers[_idx(mapRow, mapCol)] && i < radius) {
          blocked = true;
          _castOctant(cx, cy, radius, dStart, leftSlope, xx, xy, yx, yy, i + 1);
          nextStart = rightSlope;
        }
      }
      if (blocked) break;
    }
  }

  /**
   * Run shadow casting from a single source.
   * @param {number} col
   * @param {number} row
   * @param {number} radius
   */
  function _computeVisibility(col, row, radius) {
    // Source cell is always visible
    if (_inBounds(row, col)) {
      _fog[_idx(row, col)] = VISIBLE;
    }
    for (let oct = 0; oct < 8; oct++) {
      const m = _OCTANTS[oct];
      _castOctant(col, row, radius, 1.0, 0.0, m[0], m[1], m[2], m[3], 1);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Initialise the fog grid.
   * @param {number} width  - Grid width (columns).
   * @param {number} height - Grid height (rows).
   */
  function init(width, height) {
    _width    = width  || 1;
    _height   = height || 1;
    _fog      = new Uint8Array(_width * _height); // defaults to UNSEEN (0)
    _blockers = new Uint8Array(_width * _height);
    _visionSources.clear();
  }

  /**
   * Resize the fog grid, preserving existing data where possible.
   * @param {number} width
   * @param {number} height
   */
  function resize(width, height) {
    const newW = width  || 1;
    const newH = height || 1;
    const newFog      = new Uint8Array(newW * newH);
    const newBlockers = new Uint8Array(newW * newH);

    const copyRows = Math.min(_height, newH);
    const copyCols = Math.min(_width, newW);
    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        newFog[r * newW + c]      = _fog[r * _width + c];
        newBlockers[r * newW + c] = _blockers[r * _width + c];
      }
    }

    _width    = newW;
    _height   = newH;
    _fog      = newFog;
    _blockers = newBlockers;
  }

  /**
   * Add or update a vision source.
   * @param {*}      id
   * @param {number} col
   * @param {number} row
   * @param {number} radius - Vision radius in cells.
   * @param {boolean} [darkvision=false]
   */
  function setVisionSource(id, col, row, radius, darkvision) {
    _visionSources.set(id, {
      id, col, row,
      radius: radius || 6,
      darkvision: !!darkvision,
    });
  }

  /**
   * Remove a vision source.
   * @param {*} id
   */
  function removeVisionSource(id) {
    _visionSources.delete(id);
  }

  /**
   * Recalculate visibility from all vision sources.
   * Previously VISIBLE cells become EXPLORED; UNSEEN stays UNSEEN.
   */
  function recalculate() {
    if (!_fog) return;

    // Demote VISIBLE → EXPLORED
    for (let i = 0; i < _fog.length; i++) {
      if (_fog[i] === VISIBLE) _fog[i] = EXPLORED;
    }

    // Shadow-cast from each source
    for (const src of _visionSources.values()) {
      // Darkvision extends sight by 2× (D&D 5e: see in darkness as dim light).
    // Capped via ceil to keep grid-aligned.
    const effectiveRadius = src.darkvision
        ? Math.ceil(src.radius * 2)
        : src.radius;
      _computeVisibility(src.col, src.row, effectiveRadius);
    }
  }

  /**
   * Get the fog state for a cell.
   * @param {number} row
   * @param {number} col
   * @returns {number} UNSEEN (0), EXPLORED (1), or VISIBLE (2).
   */
  function getState(row, col) {
    if (!_fog || !_inBounds(row, col)) return UNSEEN;
    return _fog[_idx(row, col)];
  }

  /** @returns {boolean} */
  function isVisible(row, col) {
    return getState(row, col) === VISIBLE;
  }

  /** @returns {boolean} */
  function isExplored(row, col) {
    return getState(row, col) >= EXPLORED;
  }

  /** Reveal every cell. */
  function revealAll() {
    if (_fog) _fog.fill(VISIBLE);
  }

  /** Hide every cell (reset to UNSEEN). */
  function hideAll() {
    if (_fog) _fog.fill(UNSEEN);
  }

  /**
   * Mark a cell as blocking or non-blocking for vision.
   * @param {number} row
   * @param {number} col
   * @param {boolean} blocks
   */
  function setBlocker(row, col, blocks) {
    if (_blockers && _inBounds(row, col)) {
      _blockers[_idx(row, col)] = blocks ? 1 : 0;
    }
  }

  /**
   * Draw the fog overlay onto a canvas context.
   * Soft edges are achieved by a small gradient around VISIBLE/EXPLORED boundaries.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} tileSize
   * @param {number} mapWidth  - Number of columns.
   * @param {number} mapHeight - Number of rows.
   */
  function draw(ctx, tileSize, mapWidth, mapHeight) {
    if (!_fog || !_enabled) return;

    ctx.save();
    const cols = Math.min(mapWidth  || _width,  _width);
    const rows = Math.min(mapHeight || _height, _height);
    const pad  = tileSize * 0.15; // gradient padding for soft edges

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const state = _fog[_idx(r, c)];
        if (state === VISIBLE) continue; // fully visible — skip

        const x = c * tileSize;
        const y = r * tileSize;

        if (state === UNSEEN) {
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          ctx.fillRect(x, y, tileSize, tileSize);
        } else {
          // EXPLORED — dim overlay
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(x, y, tileSize, tileSize);
        }

        // Soft-edge gradient toward any adjacent VISIBLE cell
        if (state !== UNSEEN) {
          const neighbors = [
            [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
          ];
          for (const [nr, nc] of neighbors) {
            if (_inBounds(nr, nc) && _fog[_idx(nr, nc)] === VISIBLE) {
              const gx = nc > c ? x + tileSize - pad : nc < c ? x : x;
              const gy = nr > r ? y + tileSize - pad : nr < r ? y : y;
              const gw = nc !== c ? pad : tileSize;
              const gh = nr !== r ? pad : tileSize;

              const grad = nc !== c
                ? ctx.createLinearGradient(nc > c ? gx : gx + gw, gy, nc > c ? gx + gw : gx, gy)
                : ctx.createLinearGradient(gx, nr > r ? gy : gy + gh, gx, nr > r ? gy + gh : gy);

              grad.addColorStop(0, 'rgba(0,0,0,0.55)');
              grad.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = grad;
              ctx.fillRect(gx, gy, gw, gh);
            }
          }
        }
      }
    }
    ctx.restore();
  }

  /** Serialise fog & blocker state. */
  function serialize() {
    return {
      width:    _width,
      height:   _height,
      fog:      _fog ? Array.from(_fog) : [],
      blockers: _blockers ? Array.from(_blockers) : [],
      sources:  Array.from(_visionSources.values()),
    };
  }

  /** Restore from serialised data. */
  function deserialize(data) {
    if (!data) return;
    _width    = data.width  || 1;
    _height   = data.height || 1;
    _fog      = new Uint8Array(data.fog || []);
    _blockers = new Uint8Array(data.blockers || []);
    _visionSources.clear();
    if (Array.isArray(data.sources)) {
      for (const src of data.sources) {
        _visionSources.set(src.id, src);
      }
    }
  }

  return {
    UNSEEN,
    EXPLORED,
    VISIBLE,

    init,
    resize,
    setVisionSource,
    removeVisionSource,
    recalculate,
    getState,
    isVisible,
    isExplored,
    revealAll,
    hideAll,
    setBlocker,
    draw,
    serialize,
    deserialize,

    get enabled()  { return _enabled; },
    set enabled(v) { _enabled = !!v; },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FogOfWar;
}
