/**
 * map.js – Map Customization Tools
 * Tile-based map editor using HTML Canvas.
 * Supports terrain placement, tile editing, and encounter setup.
 */

const MapEditor = (() => {
  const TILE_SIZE = 40; // pixels per tile

  const TILES = {
    floor:    { label: 'Stone Floor',  icon: '⬜', color: '#4a3f30', border: '#5a4f40' },
    wall:     { label: 'Wall',         icon: '🟫', color: '#2a1f0f', border: '#1a0f05' },
    water:    { label: 'Water',        icon: '🟦', color: '#1a3a5a', border: '#1a4a6a' },
    grass:    { label: 'Grass',        icon: '🟩', color: '#1a3a1a', border: '#2a4a2a' },
    lava:     { label: 'Lava',         icon: '🟧', color: '#5a1a00', border: '#7a2a00' },
    door:     { label: 'Door',         icon: '🚪', color: '#3a2010', border: '#6a3a10' },
    stairs:   { label: 'Stairs',       icon: '🔼', color: '#3a3a2a', border: '#5a5a3a' },
    chest:    { label: 'Chest',        icon: '📦', color: '#4a3000', border: '#6a5000' },
    trap:     { label: 'Trap',         icon: '⚠️',  color: '#4a1a00', border: '#7a2a00' },
    empty:    { label: 'Erase',        icon: '❌', color: 'transparent', border: 'transparent' },
  };

  const TILE_KEYS = Object.keys(TILES).filter(k => k !== 'empty');

  /** State */
  let canvas   = null;
  let ctx      = null;
  let grid     = [];      // grid[row][col] = tile key or null
  let cols     = 20;
  let rows     = 15;
  let selectedTile = 'floor';
  let isPainting   = false;
  let hoveredCell  = null;

  /** Initialise the canvas and grid. */
  function init(canvasEl, mapCols = 20, mapRows = 15) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    resize(mapCols, mapRows);
    _bindEvents();
    render();
  }

  /** Resize (or reset) the map to new dimensions. */
  function resize(newCols, newRows) {
    cols = Math.max(5, Math.min(50, newCols));
    rows = Math.max(5, Math.min(30, newRows));
    canvas.width  = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    render();
  }

  /** Fill the entire map with a given tile type. */
  function fill(tileKey) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        grid[r][c] = tileKey === 'empty' ? null : tileKey;
      }
    }
    render();
  }

  /** Place a single tile at grid coordinates. */
  function placeTile(row, col, tileKey) {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    grid[row][col] = tileKey === 'empty' ? null : tileKey;
  }

  /** Return { row, col } from canvas pixel coordinates. */
  function pixelToCell(px, py) {
    return {
      col: Math.floor(px / TILE_SIZE),
      row: Math.floor(py / TILE_SIZE),
    };
  }

  /** Serialize the map to a JSON-compatible object. */
  function serialize() {
    return { cols, rows, grid: grid.map(r => r.slice()) };
  }

  /** Load a previously serialized map. */
  function deserialize(data) {
    if (!data || !data.grid) return;
    cols = data.cols;
    rows = data.rows;
    canvas.width  = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    grid = data.grid.map(r => r.slice());
    render();
  }

  /** Export map as PNG data URL. */
  function exportPNG() {
    return canvas.toDataURL('image/png');
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background (empty cell base)
    ctx.fillStyle = '#0d0a05';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Tiles
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key  = grid[r][c];
        const x    = c * TILE_SIZE;
        const y    = r * TILE_SIZE;
        if (key && TILES[key]) {
          _drawTile(ctx, x, y, TILES[key]);
        }
        // Grid lines
        ctx.strokeStyle = 'rgba(90,62,27,0.35)';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
      }
    }

    // Hover highlight
    if (hoveredCell) {
      const { row, col } = hoveredCell;
      ctx.fillStyle = 'rgba(200,168,75,0.18)';
      ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  function _drawTile(ctx, x, y, tile) {
    // Background fill
    ctx.fillStyle = tile.color;
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Subtle inner border
    ctx.strokeStyle = tile.border;
    ctx.lineWidth   = 1;
    ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

    // Emoji icon centered
    ctx.font      = `${TILE_SIZE * 0.5}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tile.icon, x + TILE_SIZE / 2, y + TILE_SIZE / 2);
  }

  // ── Event binding ───────────────────────────────────────────────────────────

  function _getCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      px: (evt.clientX - rect.left) * scaleX,
      py: (evt.clientY - rect.top)  * scaleY,
    };
  }

  function _bindEvents() {
    canvas.addEventListener('mousedown', e => {
      isPainting = true;
      const { px, py } = _getCanvasCoords(e);
      const cell = pixelToCell(px, py);
      placeTile(cell.row, cell.col, selectedTile);
      render();
    });

    canvas.addEventListener('mousemove', e => {
      const { px, py } = _getCanvasCoords(e);
      const cell = pixelToCell(px, py);
      hoveredCell = cell;
      if (isPainting) {
        placeTile(cell.row, cell.col, selectedTile);
      }
      render();
    });

    canvas.addEventListener('mouseup',    () => { isPainting = false; });
    canvas.addEventListener('mouseleave', () => { isPainting = false; hoveredCell = null; render(); });

    // Touch support
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      isPainting = true;
      const touch = e.touches[0];
      const { px, py } = _getCanvasCoords(touch);
      const cell = pixelToCell(px, py);
      placeTile(cell.row, cell.col, selectedTile);
      render();
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const touch = e.touches[0];
      const { px, py } = _getCanvasCoords(touch);
      const cell = pixelToCell(px, py);
      if (isPainting) {
        placeTile(cell.row, cell.col, selectedTile);
      }
      render();
    }, { passive: false });

    canvas.addEventListener('touchend', () => { isPainting = false; });
  }

  return {
    TILES,
    TILE_KEYS,
    TILE_SIZE,
    init,
    resize,
    fill,
    placeTile,
    pixelToCell,
    serialize,
    deserialize,
    exportPNG,
    render,
    get selectedTile()      { return selectedTile; },
    set selectedTile(v)     { selectedTile = v; },
    get grid()              { return grid; },
    get cols()              { return cols; },
    get rows()              { return rows; },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapEditor;
}
