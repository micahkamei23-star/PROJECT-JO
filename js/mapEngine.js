/**
 * mapEngine.js – Map State Management
 * Manages the structured map data: tiles, dimensions, and token placement data.
 *
 * mapState = {
 *   width: number,
 *   height: number,
 *   tiles: Array<Array<{ type: string|null, walkable: boolean }>>,
 *   tokens: Array<TokenData>   (serialised snapshot only; live tokens in tokenSystem.js)
 *   layers: { ground, walls, decals, props, effects },
 *   regions: Array<{ name, cells, metadata }>
 * }
 */

const MapEngine = (() => {
  'use strict';

  /** Canonical tile definitions (walkability + extended metadata). */
  const TILE_DEFS = {
    floor:  { label: 'Stone Floor', walkable: true,  blocksVision: false, terrain: 'normal',      soundProfile: 'stone' },
    stone:  { label: 'Stone',       walkable: true,  blocksVision: false, terrain: 'normal',      soundProfile: 'stone' },
    wall:   { label: 'Wall',        walkable: false, blocksVision: true,  terrain: 'impassable',  soundProfile: 'stone' },
    water:  { label: 'Water',       walkable: false, blocksVision: false, terrain: 'hazardous',   soundProfile: 'water' },
    door:   { label: 'Door',        walkable: true,  blocksVision: true,  terrain: 'normal',      soundProfile: 'wood'  },
    trap:   { label: 'Trap',        walkable: true,  blocksVision: false, terrain: 'hazardous',   soundProfile: 'stone' },
    grass:  { label: 'Grass',       walkable: true,  blocksVision: false, terrain: 'normal',      soundProfile: 'wood'  },
    lava:   { label: 'Lava',        walkable: false, blocksVision: false, terrain: 'hazardous',   soundProfile: 'stone' },
    stairs: { label: 'Stairs',      walkable: true,  blocksVision: false, terrain: 'normal',      soundProfile: 'stone' },
    chest:  { label: 'Chest',       walkable: true,  blocksVision: false, terrain: 'normal',      soundProfile: 'wood'  },
  };

  const LAYER_NAMES = ['ground', 'walls', 'decals', 'props', 'effects'];
  const MAX_UNDO = 50;

  /** Live map state. */
  const mapState = {
    width:  20,
    height: 15,
    tiles:  [],
    tokens: [],   // serialised token snapshots (written on save)
    layers: { ground: [], walls: [], decals: [], props: [], effects: [] },
    regions: [],
  };

  // ── Undo / Redo stacks ──────────────────────────────────────────────────────
  let _undoStack = [];
  let _redoStack = [];

  // ── Internal helpers ────────────────────────────────────────────────────────

  function _createTile(type) {
    const def = (type && TILE_DEFS[type]) ? TILE_DEFS[type] : null;
    return {
      type:     type || null,
      walkable: def ? def.walkable : true,
    };
  }

  function _clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function _createEmptyLayer(h, w) {
    return Array.from({ length: h }, () =>
      Array.from({ length: w }, () => _createTile(null))
    );
  }

  function _initLayers(h, w) {
    mapState.layers.ground  = mapState.tiles; // alias
    mapState.layers.walls   = _createEmptyLayer(h, w);
    mapState.layers.decals  = _createEmptyLayer(h, w);
    mapState.layers.props   = _createEmptyLayer(h, w);
    mapState.layers.effects = _createEmptyLayer(h, w);
  }

  function _deepCloneTiles(tiles) {
    return tiles.map(row => row.map(t => ({ ...t })));
  }

  function _snapshotState() {
    return {
      width:   mapState.width,
      height:  mapState.height,
      tiles:   _deepCloneTiles(mapState.tiles),
      layers: {
        ground:  _deepCloneTiles(mapState.tiles),
        walls:   _deepCloneTiles(mapState.layers.walls),
        decals:  _deepCloneTiles(mapState.layers.decals),
        props:   _deepCloneTiles(mapState.layers.props),
        effects: _deepCloneTiles(mapState.layers.effects),
      },
      regions: mapState.regions.map(r => ({
        name: r.name,
        cells: r.cells.map(c => ({ ...c })),
        metadata: { ...r.metadata },
      })),
      tokens: (mapState.tokens || []).map(t => ({
        ...t,
        statusEffects: [...(t.statusEffects || [])],
      })),
    };
  }

  function _restoreSnapshot(snap) {
    mapState.width   = snap.width;
    mapState.height  = snap.height;
    mapState.tiles   = _deepCloneTiles(snap.tiles);
    mapState.layers.ground  = mapState.tiles;
    mapState.layers.walls   = _deepCloneTiles(snap.layers.walls);
    mapState.layers.decals  = _deepCloneTiles(snap.layers.decals);
    mapState.layers.props   = _deepCloneTiles(snap.layers.props);
    mapState.layers.effects = _deepCloneTiles(snap.layers.effects);
    mapState.regions = snap.regions.map(r => ({
      name: r.name,
      cells: r.cells.map(c => ({ ...c })),
      metadata: { ...r.metadata },
    }));
    mapState.tokens = (snap.tokens || []).map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
    }));
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Initialise (or reset) the map to the given dimensions. */
  function initMap(width, height) {
    mapState.width  = _clamp(width  || 20, 5, 50);
    mapState.height = _clamp(height || 15, 5, 30);
    mapState.tiles  = Array.from({ length: mapState.height }, () =>
      Array.from({ length: mapState.width }, () => _createTile(null))
    );
    mapState.tokens = [];
    mapState.regions = [];
    _initLayers(mapState.height, mapState.width);
    _undoStack = [];
    _redoStack = [];
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
    // Keep ground layer in sync
    mapState.layers.ground = mapState.tiles;
  }

  /** Fill the entire map with a tile type. */
  function fillMap(type) {
    const actualType = (!type || type === 'empty') ? null : type;
    for (let r = 0; r < mapState.height; r++) {
      for (let c = 0; c < mapState.width; c++) {
        mapState.tiles[r][c] = _createTile(actualType);
      }
    }
    mapState.layers.ground = mapState.tiles;
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
    mapState.layers.ground = mapState.tiles;
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
    // Rebuild layers on resize, preserving existing data where possible
    for (const name of LAYER_NAMES) {
      if (name === 'ground') {
        mapState.layers.ground = mapState.tiles;
        continue;
      }
      const oldLayer = mapState.layers[name] || [];
      mapState.layers[name] = Array.from({ length: h }, (_, r) =>
        Array.from({ length: w }, (_, c) =>
          (oldLayer[r] && oldLayer[r][c]) ? oldLayer[r][c] : _createTile(null)
        )
      );
    }
  }

  // ── Layer API ─────────────────────────────────────────────────────────────

  /** Get layer data by name. */
  function getLayer(layerName) {
    if (!LAYER_NAMES.includes(layerName)) return null;
    return mapState.layers[layerName];
  }

  /** Set a tile on a specific layer. */
  function setTileOnLayer(layerName, row, col, type) {
    if (!LAYER_NAMES.includes(layerName)) return;
    if (row < 0 || row >= mapState.height || col < 0 || col >= mapState.width) return;
    const actualType = (!type || type === 'empty') ? null : type;
    if (layerName === 'ground') {
      setTile(row, col, type);
      return;
    }
    mapState.layers[layerName][row][col] = _createTile(actualType);
  }

  // ── Region API ────────────────────────────────────────────────────────────

  /** Define a named region with an array of {row, col} cells and optional metadata. */
  function addRegion(name, cells, metadata) {
    // Remove existing region with same name
    mapState.regions = mapState.regions.filter(r => r.name !== name);
    mapState.regions.push({
      name,
      cells: (cells || []).map(c => ({ row: c.row, col: c.col })),
      metadata: metadata ? { ...metadata } : {},
    });
  }

  /** Remove a region by name. */
  function removeRegion(name) {
    mapState.regions = mapState.regions.filter(r => r.name !== name);
  }

  /** Get a region by name. */
  function getRegion(name) {
    return mapState.regions.find(r => r.name === name) || null;
  }

  /** Get all regions that contain the given cell. */
  function getRegionsAt(row, col) {
    return mapState.regions.filter(r =>
      r.cells.some(c => c.row === row && c.col === col)
    );
  }

  // ── Undo / Redo API ───────────────────────────────────────────────────────

  /** Push the current state onto the undo stack. */
  function pushUndo() {
    _undoStack.push(_snapshotState());
    if (_undoStack.length > MAX_UNDO) _undoStack.shift();
    _redoStack = [];
  }

  /** Restore the previous state from the undo stack. */
  function undo() {
    if (_undoStack.length === 0) return;
    _redoStack.push(_snapshotState());
    _restoreSnapshot(_undoStack.pop());
  }

  /** Re-apply the last undone state. */
  function redo() {
    if (_redoStack.length === 0) return;
    _undoStack.push(_snapshotState());
    _restoreSnapshot(_redoStack.pop());
  }

  /** Check if undo is available. */
  function canUndo() { return _undoStack.length > 0; }

  /** Check if redo is available. */
  function canRedo() { return _redoStack.length > 0; }

  // ── Drawing algorithms ────────────────────────────────────────────────────

  /** Draw a line using Bresenham's algorithm. */
  function drawLine(r1, c1, r2, c2, type) {
    let dr = Math.abs(r2 - r1);
    let dc = Math.abs(c2 - c1);
    const sr = r1 < r2 ? 1 : -1;
    const sc = c1 < c2 ? 1 : -1;
    let err = dc - dr;
    let r = r1, c = c1;

    while (true) {
      setTile(r, c, type);
      if (r === r2 && c === c2) break;
      const e2 = 2 * err;
      if (e2 > -dr) { err -= dr; c += sc; }
      if (e2 <  dc) { err += dc; r += sr; }
    }
  }

  /** Draw a circle using the midpoint circle algorithm. */
  function drawCircle(centerRow, centerCol, radius, type) {
    if (radius <= 0) {
      setTile(centerRow, centerCol, type);
      return;
    }
    let x = radius;
    let y = 0;
    let err = 1 - radius;

    while (x >= y) {
      // 8 octants
      setTile(centerRow + y, centerCol + x, type);
      setTile(centerRow + x, centerCol + y, type);
      setTile(centerRow + x, centerCol - y, type);
      setTile(centerRow + y, centerCol - x, type);
      setTile(centerRow - y, centerCol - x, type);
      setTile(centerRow - x, centerCol - y, type);
      setTile(centerRow - x, centerCol + y, type);
      setTile(centerRow - y, centerCol + x, type);

      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  // ── Serialization (extended) ──────────────────────────────────────────────

  /** Serialise the map to a plain-object snapshot. */
  function serialize() {
    const result = {
      width:  mapState.width,
      height: mapState.height,
      tiles:  mapState.tiles.map(row => row.map(t => ({ ...t }))),
      tokens: (mapState.tokens || []).map(t => ({
        ...t,
        statusEffects: [...(t.statusEffects || [])],
      })),
      layers: {},
      regions: mapState.regions.map(r => ({
        name: r.name,
        cells: r.cells.map(c => ({ ...c })),
        metadata: { ...r.metadata },
      })),
    };
    for (const name of LAYER_NAMES) {
      if (name === 'ground') {
        result.layers.ground = result.tiles; // same reference in serialized form
        continue;
      }
      result.layers[name] = (mapState.layers[name] || []).map(row =>
        row.map(t => ({ ...t }))
      );
    }
    return result;
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
    // Restore layers
    mapState.layers.ground = mapState.tiles;
    for (const name of LAYER_NAMES) {
      if (name === 'ground') continue;
      if (data.layers && data.layers[name]) {
        mapState.layers[name] = data.layers[name].map(row =>
          row.map(t => ({ ...t }))
        );
      } else {
        mapState.layers[name] = _createEmptyLayer(mapState.height, mapState.width);
      }
    }
    // Restore regions
    mapState.regions = (data.regions || []).map(r => ({
      name: r.name,
      cells: (r.cells || []).map(c => ({ ...c })),
      metadata: r.metadata ? { ...r.metadata } : {},
    }));
  }

  return {
    TILE_DEFS,
    LAYER_NAMES,
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
    // Layer API
    getLayer,
    setTileOnLayer,
    // Region API
    addRegion,
    removeRegion,
    getRegion,
    getRegionsAt,
    // Undo / Redo
    pushUndo,
    undo,
    redo,
    canUndo,
    canRedo,
    // Drawing
    drawLine,
    drawCircle,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapEngine;
}
