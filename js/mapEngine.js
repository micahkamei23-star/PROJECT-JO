/**
 * mapEngine.js – Map State Management
 * Manages the structured map data: tiles, dimensions, and token placement data.
 *
 * mapState = {
 *   width: number,
 *   height: number,
 *   tiles: Array<Array<{ type: string|null, walkable: boolean }>>,
 *   tokens: Array<TokenData>   (serialised snapshot only; live tokens in tokenSystem.js)
 * }
 */

const MapEngine = (() => {
  'use strict';

  /** Canonical tile definitions (walkability). */
  const TILE_DEFS = {
    floor:  { label: 'Stone Floor', walkable: true  },
    stone:  { label: 'Stone',       walkable: true  },
    wall:   { label: 'Wall',        walkable: false },
    water:  { label: 'Water',       walkable: false },
    door:   { label: 'Door',        walkable: true  },
    trap:   { label: 'Trap',        walkable: true  },
    grass:  { label: 'Grass',       walkable: true  },
    lava:   { label: 'Lava',        walkable: false },
    stairs: { label: 'Stairs',      walkable: true  },
    chest:  { label: 'Chest',       walkable: true  },
  };

  /** Live map state. */
  const mapState = {
    width:  20,
    height: 15,
    tiles:  [],
    tokens: [],   // serialised token snapshots (written on save)
  };

  // ── Internal helpers ────────────────────────────────────────────────────────

  function _createTile(type) {
    const def = (type && TILE_DEFS[type]) ? TILE_DEFS[type] : null;
    return {
      type:     type || null,
      walkable: def ? def.walkable : true,
    };
  }

  function _clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Initialise (or reset) the map to the given dimensions. */
  function initMap(width, height) {
    mapState.width  = _clamp(width  || 20, 5, 50);
    mapState.height = _clamp(height || 15, 5, 30);
    mapState.tiles  = Array.from({ length: mapState.height }, () =>
      Array.from({ length: mapState.width }, () => _createTile(null))
    );
    mapState.tokens = [];
  }

  /** Return tile at (row, col), or null if out of bounds. */
  function getTile(row, col) {
    if (row < 0 || row >= mapState.height || col < 0 || col >= mapState.width) return null;
    return mapState.tiles[row][col];
  }

  /** Set tile at (row, col). Use null / 'empty' to erase. */
  function setTile(row, col, type) {
    if (row < 0 || row >= mapState.height || col < 0 || col >= mapState.width) return;
    const actualType = (!type || type === 'empty') ? null : type;
    mapState.tiles[row][col] = _createTile(actualType);
  }

  /** Fill the entire map with a tile type. */
  function fillMap(type) {
    const actualType = (!type || type === 'empty') ? null : type;
    for (let r = 0; r < mapState.height; r++) {
      for (let c = 0; c < mapState.width; c++) {
        mapState.tiles[r][c] = _createTile(actualType);
      }
    }
  }

  /** Flood-fill from (startRow, startCol) replacing tiles of the same type. */
  function floodFill(startRow, startCol, type) {
    const actualType = (!type || type === 'empty') ? null : type;
    if (startRow < 0 || startRow >= mapState.height ||
        startCol < 0 || startCol >= mapState.width) return;

    const targetType = mapState.tiles[startRow][startCol].type;
    if (targetType === actualType) return;     // nothing to do

    const stack   = [[startRow, startCol]];
    const visited = new Set();

    while (stack.length > 0) {
      const [r, c] = stack.pop();
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (r < 0 || r >= mapState.height || c < 0 || c >= mapState.width) continue;
      if (mapState.tiles[r][c].type !== targetType) continue;

      visited.add(key);
      mapState.tiles[r][c] = _createTile(actualType);

      stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }
  }

  /** Fill a rectangular region with a tile type. */
  function fillRect(r1, c1, r2, c2, type) {
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        setTile(r, c, type);
      }
    }
  }

  /** Resize the map, preserving existing tile data where possible. */
  function resize(newWidth, newHeight) {
    const w = _clamp(newWidth,  5, 50);
    const h = _clamp(newHeight, 5, 30);
    const oldTiles = mapState.tiles;
    mapState.width  = w;
    mapState.height = h;
    mapState.tiles  = Array.from({ length: h }, (_, r) =>
      Array.from({ length: w }, (_, c) =>
        (oldTiles[r] && oldTiles[r][c]) ? oldTiles[r][c] : _createTile(null)
      )
    );
  }

  /** Serialise the map to a plain-object snapshot. */
  function serialize() {
    return {
      width:  mapState.width,
      height: mapState.height,
      tiles:  mapState.tiles.map(row => row.map(t => ({ ...t }))),
      tokens: (mapState.tokens || []).map(t => ({
        ...t,
        statusEffects: [...(t.statusEffects || [])],
      })),
    };
  }

  /** Restore a previously serialised map. */
  function deserialize(data) {
    if (!data || !data.tiles) return;
    mapState.width  = data.width  || 20;
    mapState.height = data.height || 15;
    mapState.tiles  = data.tiles.map(row => row.map(t => ({ ...t })));
    mapState.tokens = (data.tokens || []).map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
    }));
  }

  return {
    TILE_DEFS,
    get mapState() { return mapState; },
    get width()    { return mapState.width; },
    get height()   { return mapState.height; },
    initMap,
    getTile,
    setTile,
    fillMap,
    floodFill,
    fillRect,
    resize,
    serialize,
    deserialize,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapEngine;
}
