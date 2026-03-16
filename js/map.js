/**
 * map.js – Map Editor Coordinator
 *
 * Orchestrates the new sub-modules:
 *   MapEngine    – tile state & data operations
 *   TileRenderer – canvas drawing
 *   TokenSystem  – token management & rendering
 *   CombatSystem – turn order & initiative
 *   UIControls   – mouse / touch / zoom input
 *
 * Public API is kept backward-compatible so existing main.js code continues
 * to work, plus new methods for tokens and combat.
 */

const MapEditor = (() => {
  'use strict';

  const TILE_SIZE = 40;   // pixels per grid cell (world space)

  let _canvas  = null;
  let _ctx     = null;
  let _rafId   = null;
  let _dirty   = true;

  let _selectedTile  = 'floor';
  let _onLog         = null;    // (message: string) => void
  let _onTokenSelect = null;    // (id: number|null) => void

  // ── Initialise ──────────────────────────────────────────────────────────────

  function init(canvasEl, mapCols = 20, mapRows = 15) {
    _canvas = canvasEl;
    _ctx    = canvasEl.getContext('2d');

    // Initialise tile state
    MapEngine.initMap(mapCols, mapRows);
    _syncCanvasSize();

    // Initialise fog of war system
    FogSystem.init(MapEngine.width, MapEngine.height, MapEngine.getTile);

    // Initialise token system
    TokenSystem.init(
      MapEngine.width, MapEngine.height,
      _handleTokenSelected,
      _handleTokenAction
    );

    // Initialise combat system (callback wired later by main.js)
    CombatSystem.init(null);

    // Initialise input layer
    UIControls.init({
      tileSize:      TILE_SIZE,
      onPaint:       _paintCell,
      onFill:        _fillCell,
      onRect:        _rectFill,
      onLine:        _lineFill,
      onViewChange:  _markDirty,
      onPointerDown: (wx, wy) => TokenSystem.handlePointerDown(wx, wy, TILE_SIZE),
      onPointerMove: (wx, wy) => {
        const hit = TokenSystem.handlePointerMove(wx, wy, TILE_SIZE);
        if (hit) {
          // Update fog visibility when a token is being dragged
          if (FogSystem.enabled) {
            FogSystem.updateVisibility(TokenSystem.getAll());
          }
          _markDirty();
        }
        return hit;
      },
      onPointerUp: () => {
        TokenSystem.handlePointerUp();
        // Refresh fog after token drop
        if (FogSystem.enabled) {
          FogSystem.updateVisibility(TokenSystem.getAll());
        }
        _markDirty();
      },
    });
    UIControls.bindCanvas(_canvas);

    _startLoop();
  }

  // ── Render loop ─────────────────────────────────────────────────────────────

  function _startLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);
    function loop(ts) {
      TileRenderer.updateAnimation(ts);
      if (_dirty || _hasAnimatedTiles()) {
        render();
        _dirty = false;
      }
      _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);
  }

  function _hasAnimatedTiles() {
    const { tiles, width, height } = MapEngine.mapState;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const t = tiles[r][c];
        if (t && (t.type === 'water' || t.type === 'lava')) return true;
      }
    }
    return false;
  }

  function _markDirty() { _dirty = true; }

  // ── Rendering ────────────────────────────────────────────────────────────────

  function render() {
    if (!_ctx) return;
    const { tiles, width: mW, height: mH } = MapEngine.mapState;

    _ctx.save();
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    // Viewport transform
    _ctx.translate(UIControls.offsetX, UIControls.offsetY);
    _ctx.scale(UIControls.scale, UIControls.scale);

    // Dark dungeon background
    TileRenderer.drawBackground(_ctx, mW * TILE_SIZE, mH * TILE_SIZE);

    // Tiles
    for (let r = 0; r < mH; r++) {
      for (let c = 0; c < mW; c++) {
        const tile = tiles[r][c];
        if (tile && tile.type) {
          TileRenderer.drawTile(_ctx, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, tile.type);
        }
      }
    }

    // Grid overlay
    if (UIControls.showGrid) {
      TileRenderer.drawGrid(_ctx, mW, mH, TILE_SIZE);
    }

    // Hover highlight
    const hov = UIControls.hoveredCell;
    if (hov && hov.row >= 0 && hov.row < mH && hov.col >= 0 && hov.col < mW) {
      TileRenderer.drawHover(_ctx, hov.row, hov.col, TILE_SIZE);
    }

    // Rect-tool preview
    const rs = UIControls.rectStart, re = UIControls.rectEnd;
    if (rs && re) {
      TileRenderer.drawRectPreview(_ctx, rs.row, rs.col, re.row, re.col, TILE_SIZE);
    }

    // Line-tool preview
    const ls = UIControls.lineStart, le = UIControls.lineEnd;
    if (ls && le) {
      TileRenderer.drawLinePreview(_ctx, ls.row, ls.col, le.row, le.col, TILE_SIZE);
    }

    // Tokens
    TokenSystem.drawTokens(_ctx, TILE_SIZE);

    // Fog of war overlay (drawn last so it covers tiles and tokens)
    FogSystem.drawFog(_ctx, mW, mH, TILE_SIZE);

    _ctx.restore();
  }

  // ── Canvas sizing ─────────────────────────────────────────────────────────────

  function _syncCanvasSize() {
    _canvas.width  = MapEngine.width  * TILE_SIZE;
    _canvas.height = MapEngine.height * TILE_SIZE;
  }

  // ── Tile painting callbacks (from UIControls) ─────────────────────────────────

  function _paintCell(row, col, tool) {
    if (tool === 'eraser') {
      MapEngine.setTile(row, col, null);
    } else {
      MapEngine.setTile(row, col, _selectedTile);
    }
    _markDirty();
  }

  function _fillCell(row, col) {
    MapEngine.floodFill(row, col, _selectedTile);
    _markDirty();
  }

  function _rectFill(r1, c1, r2, c2) {
    MapEngine.fillRect(r1, c1, r2, c2, _selectedTile);
    _markDirty();
  }

  /** Paint tiles along a Bresenham line from (r1,c1) to (r2,c2). */
  function _lineFill(r1, c1, r2, c2) {
    const cells = TileRenderer.bresenhamLine(r1, c1, r2, c2);
    const type  = UIControls.activeTool === 'eraser' ? null : _selectedTile;
    for (const { row, col } of cells) {
      MapEngine.setTile(row, col, type);
    }
    _markDirty();
  }

  // ── Token event callbacks ─────────────────────────────────────────────────────

  function _handleTokenSelected(id) {
    _markDirty();
    if (_onTokenSelect) _onTokenSelect(id);
  }

  function _handleTokenAction(tokenId, actionKey, message) {
    if (_onLog) _onLog(message);
  }

  // ── Public API – core (backward-compatible) ───────────────────────────────────

  function fill(tileKey) {
    MapEngine.fillMap(tileKey);
    _markDirty();
  }

  function resize(newCols, newRows) {
    MapEngine.resize(newCols, newRows);
    _syncCanvasSize();
    TokenSystem.setMapSize(MapEngine.width, MapEngine.height);
    FogSystem.setMapSize(MapEngine.width, MapEngine.height);
    _markDirty();
  }

  function serialize() {
    return {
      ...MapEngine.serialize(),
      tokens: TokenSystem.serialize(),
      fog:    FogSystem.serialize(),
    };
  }

  function deserialize(data) {
    if (!data) return;

    // Support both old format (cols/rows/grid[][]) and new format (width/height/tiles[][])
    // Old format: { cols, rows, grid: string[][] }
    // New format: { width, height, tiles: { type, walkable }[][] }
    if (data.grid && !data.tiles) {
      // Legacy format → convert
      MapEngine.initMap(data.cols || 20, data.rows || 15);
      data.grid.forEach((row, r) =>
        row.forEach((key, c) => { if (key) MapEngine.setTile(r, c, key); })
      );
    } else {
      MapEngine.deserialize(data);
    }

    _syncCanvasSize();
    TokenSystem.setMapSize(MapEngine.width, MapEngine.height);
    FogSystem.setMapSize(MapEngine.width, MapEngine.height);
    if (data.tokens) TokenSystem.deserialize(data.tokens);
    if (data.fog)    FogSystem.deserialize(data.fog);
    _markDirty();
  }

  function exportPNG() {
    render();
    return _canvas.toDataURL('image/png');
  }

  // ── Public API – new features ─────────────────────────────────────────────────

  function setTool(tool) { UIControls.activeTool = tool; }
  function toggleGrid()  { UIControls.showGrid = !UIControls.showGrid; }
  function resetView()   { UIControls.resetView(); }

  function addToken(characterId, name, avatar, hp, maxHp, gridCol, gridRow) {
    const id = TokenSystem.addToken(characterId, name, avatar, hp, maxHp, gridCol, gridRow);
    // Update fog visibility whenever a token is placed
    if (FogSystem.enabled) {
      FogSystem.updateVisibility(TokenSystem.getAll());
    }
    _markDirty();
    return id;
  }

  function removeToken(id) {
    TokenSystem.removeToken(id);
    if (FogSystem.enabled) {
      FogSystem.updateVisibility(TokenSystem.getAll());
    }
    _markDirty();
  }

  function removeTokenByCharId(cid) {
    TokenSystem.removeTokenByCharId(cid);
    if (FogSystem.enabled) {
      FogSystem.updateVisibility(TokenSystem.getAll());
    }
    _markDirty();
  }

  function getTokens()       { return TokenSystem.getAll(); }
  function getSelectedToken(){ return TokenSystem.getSelected(); }

  function triggerTokenAction(tokenId, actionKey) {
    TokenSystem.triggerAction(tokenId, actionKey);
    _markDirty();
  }

  /** Toggle fog of war on/off. */
  function toggleFog() {
    FogSystem.setEnabled(!FogSystem.enabled);
    if (FogSystem.enabled) {
      FogSystem.updateVisibility(TokenSystem.getAll());
    }
    _markDirty();
    return FogSystem.enabled;
  }

  /** Reset fog (re-hide all explored tiles). */
  function resetFog() {
    FogSystem.resetFog();
    if (FogSystem.enabled) {
      FogSystem.updateVisibility(TokenSystem.getAll());
    }
    _markDirty();
  }

  function startCombat() {
    const order = CombatSystem.rollInitiativeForTokens(TokenSystem.getAll());
    if (_onLog && order.length > 0) {
      _onLog(`⚔️ Combat started! Round 1. Initiative order: ${order.map(p => p.name).join(' → ')}`);
    }
    return order;
  }

  function nextTurn() {
    const participant = CombatSystem.nextTurn();
    if (participant && _onLog) {
      _onLog(`⏭ It is now ${participant.name}'s turn (Round ${CombatSystem.combatState.round}).`);
    }
    return participant;
  }

  function endCombat() {
    CombatSystem.endCombat();
    if (_onLog) _onLog('🏳 Combat ended.');
  }

  function onLog(cb)            { _onLog = cb; }
  function onTokenSelect(cb)    { _onTokenSelect = cb; }
  function setCombatCallback(cb){ CombatSystem.init(cb); }

  return {
    // Legacy constants (used by main.js tile palette)
    get TILES()     { return TileRenderer.TILE_STYLES; },
    get TILE_KEYS() { return TileRenderer.TILE_KEYS; },
    TILE_SIZE,

    // Legacy state accessors
    get selectedTile()      { return _selectedTile; },
    set selectedTile(v)     { _selectedTile = v; },
    get cols()              { return MapEngine.width; },
    get rows()              { return MapEngine.height; },
    get showGrid()          { return UIControls.showGrid; },
    get activeTool()        { return UIControls.activeTool; },

    // Core
    init,
    render,
    fill,
    resize,
    serialize,
    deserialize,
    exportPNG,

    // Tools & view
    setTool,
    toggleGrid,
    resetView,

    // Tokens
    addToken,
    removeToken,
    removeTokenByCharId,
    getTokens,
    getSelectedToken,
    triggerTokenAction,

    // Combat
    startCombat,
    nextTurn,
    endCombat,

    // Fog of war
    toggleFog,
    resetFog,
    get fogEnabled() { return FogSystem.enabled; },

    // Callbacks
    onLog,
    onTokenSelect,
    setCombatCallback,

    // Sub-system access (for advanced use)
    get tokenSystem()  { return TokenSystem; },
    get combatSystem() { return CombatSystem; },
    get engine()       { return MapEngine; },
    get fogSystem()    { return FogSystem; },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapEditor;
}
