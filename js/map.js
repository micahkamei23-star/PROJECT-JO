/**
 * map.js – Map Editor Coordinator
 *
 * Orchestrates the new sub-modules:
 *   MapEngine       – tile state, layers, regions, undo/redo, drawing tools
 *   TileRenderer    – canvas drawing
 *   TokenSystem     – token management, rendering, auras, lerp, vision
 *   CombatSystem    – turn order, initiative, action economy, conditions
 *   UIControls      – mouse / touch / zoom input
 *   FogOfWar        – fog of war & line-of-sight (engine)
 *   ParticleSystem  – particle effects (engine)
 *   RenderPipeline  – layered render passes & camera shake (engine)
 *
 * Public API is kept backward-compatible so existing main.js code continues
 * to work, plus new methods for tokens, combat, fog, particles, undo/redo,
 * regions, and drawing tools.
 */

const MapEditor = (() => {
  'use strict';

  const TILE_SIZE = 40;   // pixels per grid cell (world space)

  // Module availability checks (graceful degradation)
  const _hasFog       = typeof FogOfWar !== 'undefined';
  const _hasParticles = typeof ParticleSystem !== 'undefined';
  const _hasPipeline  = typeof RenderPipeline !== 'undefined';
  const _hasEventBus  = typeof EventBus !== 'undefined';

  let _canvas  = null;
  let _ctx     = null;
  let _rafId   = null;
  let _dirty   = true;
  let _lastTs  = 0;       // timestamp of previous frame (ms)

  let _selectedTile  = 'floor';
  let _onLog         = null;    // (message: string) => void
  let _onTokenSelect = null;    // (id: number|null) => void

  let _fogEnabled = false;      // fog of war toggle

  // ── Initialise ──────────────────────────────────────────────────────────────

  function init(canvasEl, mapCols = 20, mapRows = 15) {
    _canvas = canvasEl;
    _ctx    = canvasEl.getContext('2d');

    // Initialise tile state
    MapEngine.initMap(mapCols, mapRows);
    _syncCanvasSize();

    // Initialise token system
    TokenSystem.init(
      MapEngine.width, MapEngine.height,
      _handleTokenSelected,
      _handleTokenAction
    );

    // Initialise combat system (callback wired later by main.js)
    CombatSystem.init(null);

    // Initialise fog of war
    if (_hasFog) {
      FogOfWar.init(mapCols, mapRows);
      _syncFogBlockers();
    }

    // Initialise render pipeline (loose integration)
    if (_hasPipeline) {
      RenderPipeline.clear();
    }

    // Initialise input layer via InteractionManager (single source of truth)
    const _imOpts = {
      tileSize:      TILE_SIZE,
      onPaint:       _paintCell,
      onFill:        _fillCell,
      onRect:        _rectFill,
      onViewChange:  _markDirty,
      onPointerDown: (wx, wy) => TokenSystem.handlePointerDown(wx, wy, TILE_SIZE),
      onPointerMove: (wx, wy) => {
        const hit = TokenSystem.handlePointerMove(wx, wy, TILE_SIZE);
        if (hit) _markDirty();
        return hit;
      },
      onPointerUp: () => {
        TokenSystem.handlePointerUp();
        _updateAllVisionSources();
        _markDirty();
      },
      // Context callbacks for right-click actions
      getTokenAt: (wx, wy) => {
        const col = Math.floor(wx / TILE_SIZE);
        const row = Math.floor(wy / TILE_SIZE);
        const tokens = TokenSystem.getAll();
        for (let i = tokens.length - 1; i >= 0; i--) {
          if (tokens[i].x === col && tokens[i].y === row) return tokens[i];
        }
        return null;
      },
      getTileAt: (row, col) => MapEngine.getTile(row, col),
      onContextToken: (token) => {
        TokenSystem.selectToken(token.id);
      },
      onContextTile: (tile, row, col) => {
        _selectedTile = tile.type;
      },
      onContextMap: (col, row) => {
        UIControls.resetView();
      },
    };

    if (typeof InteractionManager !== 'undefined') {
      InteractionManager.init(_canvas, _imOpts);
    } else {
      // Fallback: direct UIControls wiring
      UIControls.init(_imOpts);
      UIControls.bindCanvas(_canvas);
    }

    _lastTs = 0;
    _startLoop();
  }

  // ── Fog helpers ─────────────────────────────────────────────────────────────

  function _syncFogBlockers() {
    if (!_hasFog) return;
    const { tiles, width: mW, height: mH } = MapEngine.mapState;
    for (let r = 0; r < mH; r++) {
      for (let c = 0; c < mW; c++) {
        const tile = tiles[r][c];
        const blocks = tile && (tile.type === 'wall' || tile.type === 'stone');
        FogOfWar.setBlocker(r, c, !!blocks);
      }
    }
  }

  function _updateAllVisionSources() {
    if (!_hasFog || !_fogEnabled) return;
    const tokens = TokenSystem.getAll();
    tokens.forEach(function (tok) {
      FogOfWar.setVisionSource(
        tok.id,
        tok.x, tok.y,
        tok.visionRadius || 6,
        tok.darkvision || 0
      );
    });
    FogOfWar.recalculate();
  }

  function _updateTokenVision(token) {
    if (!_hasFog || !_fogEnabled || !token) return;
    FogOfWar.setVisionSource(
      token.id,
      token.x, token.y,
      token.visionRadius || 6,
      token.darkvision || 0
    );
    FogOfWar.recalculate();
  }

  function _reinitFog() {
    if (!_hasFog) return;
    FogOfWar.init(MapEngine.width, MapEngine.height);
    _syncFogBlockers();
    if (_fogEnabled) _updateAllVisionSources();
  }

  // ── Render loop ─────────────────────────────────────────────────────────────

  function _startLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);
    function loop(ts) {
      let dt = _lastTs ? (ts - _lastTs) / 1000 : 0;
      if (dt > 0.1) dt = 0.1; // clamp to avoid spiral
      _lastTs = ts;

      TileRenderer.updateAnimation(ts);

      // Update token lerp interpolation
      if (typeof TokenSystem.updateLerp === 'function') {
        TokenSystem.updateLerp(dt);
      }

      // Update particle system
      if (_hasParticles) {
        ParticleSystem.update(dt);
      }

      const needsRender = _dirty
        || _hasAnimatedTiles()
        || (_hasParticles && ParticleSystem.particleCount() > 0)
        || _isLerping();

      if (needsRender) {
        render();
        _dirty = false;
      }

      _rafId = requestAnimationFrame(loop);
    }
    _rafId = requestAnimationFrame(loop);
  }

  function _isLerping() {
    const tokens = TokenSystem.getAll();
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].lerpPosition && tokens[i].lerpPosition.t < 1) return true;
    }
    return false;
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

  function _markDirty() {
    _dirty = true;
    if (_hasPipeline) RenderPipeline.markAllDirty();
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  function render() {
    if (!_ctx) return;
    const { tiles, width: mW, height: mH } = MapEngine.mapState;

    _ctx.save();
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    // Camera shake offset
    let shakeX = 0, shakeY = 0;
    if (_hasPipeline && typeof RenderPipeline.getStats === 'function') {
      const stats = RenderPipeline.getStats();
      if (stats && stats.shakeX) shakeX = stats.shakeX;
      if (stats && stats.shakeY) shakeY = stats.shakeY;
    }

    // Viewport transform
    _ctx.translate(UIControls.offsetX + shakeX, UIControls.offsetY + shakeY);
    _ctx.scale(UIControls.scale, UIControls.scale);

    // Pass: background
    TileRenderer.drawBackground(_ctx, mW * TILE_SIZE, mH * TILE_SIZE);

    // Pass: tiles
    for (let r = 0; r < mH; r++) {
      for (let c = 0; c < mW; c++) {
        const tile = tiles[r][c];
        if (tile && tile.type) {
          TileRenderer.drawTile(_ctx, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, tile.type);
        }
      }
    }

    // Pass: grid overlay
    if (UIControls.showGrid) {
      TileRenderer.drawGrid(_ctx, mW, mH, TILE_SIZE);
    }

    // Pass: tokens
    TokenSystem.drawTokens(_ctx, TILE_SIZE);

    // Pass: particles (after tokens, before fog)
    if (_hasParticles) {
      ParticleSystem.draw(_ctx);
    }

    // Pass: fog of war (after particles, before UI)
    if (_hasFog && _fogEnabled) {
      FogOfWar.draw(_ctx, TILE_SIZE, mW, mH);
    }

    // Pass: UI overlays
    const hov = UIControls.hoveredCell;
    if (hov && hov.row >= 0 && hov.row < mH && hov.col >= 0 && hov.col < mW) {
      TileRenderer.drawHover(_ctx, hov.row, hov.col, TILE_SIZE);
    }

    const rs = UIControls.rectStart, re = UIControls.rectEnd;
    if (rs && re) {
      TileRenderer.drawRectPreview(_ctx, rs.row, rs.col, re.row, re.col, TILE_SIZE);
    }

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
    _syncFogBlockers();
    _markDirty();
  }

  function _fillCell(row, col) {
    MapEngine.floodFill(row, col, _selectedTile);
    _syncFogBlockers();
    _markDirty();
  }

  function _rectFill(r1, c1, r2, c2) {
    MapEngine.fillRect(r1, c1, r2, c2, _selectedTile);
    _syncFogBlockers();
    _markDirty();
  }

  // ── Token event callbacks ─────────────────────────────────────────────────────

  function _handleTokenSelected(id) {
    _markDirty();
    if (_onTokenSelect) _onTokenSelect(id);
  }

  function _handleTokenAction(tokenId, actionKey, message) {
    if (_onLog) _onLog(message);

    // Spawn particle effects for token actions
    if (_hasParticles) {
      const token = TokenSystem.getToken(tokenId);
      if (token) {
        const px = (token.x + 0.5) * TILE_SIZE;
        const py = (token.y + 0.5) * TILE_SIZE;
        if (actionKey === 'attack') {
          ParticleSystem.spawnBurst('hit', px, py, 12);
        } else if (actionKey === 'spell') {
          ParticleSystem.spawnBurst('magic', px, py, 16);
        } else if (actionKey === 'heal') {
          ParticleSystem.spawnBurst('heal', px, py, 14);
        }
        _markDirty();
      }
    }
  }

  // ── Particle helpers ──────────────────────────────────────────────────────────

  function spawnEffect(preset, gridCol, gridRow) {
    if (!_hasParticles) return null;
    const px = (gridCol + 0.5) * TILE_SIZE;
    const py = (gridRow + 0.5) * TILE_SIZE;
    _markDirty();
    return ParticleSystem.spawnEffect(preset, px, py);
  }

  function spawnBurst(preset, gridCol, gridRow, count) {
    if (!_hasParticles) return;
    const px = (gridCol + 0.5) * TILE_SIZE;
    const py = (gridRow + 0.5) * TILE_SIZE;
    ParticleSystem.spawnBurst(preset, px, py, count);
    _markDirty();
  }

  // ── Fog public methods ────────────────────────────────────────────────────────

  function toggleFog() {
    _fogEnabled = !_fogEnabled;
    if (_hasFog) {
      FogOfWar.enabled = _fogEnabled;
      if (_fogEnabled) _updateAllVisionSources();
    }
    _markDirty();
    return _fogEnabled;
  }

  function isFogEnabled() {
    return _fogEnabled;
  }

  function setFogEnabled(val) {
    _fogEnabled = !!val;
    if (_hasFog) {
      FogOfWar.enabled = _fogEnabled;
      if (_fogEnabled) _updateAllVisionSources();
    }
    _markDirty();
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────────

  function undo() {
    if (typeof MapEngine.undo === 'function') {
      MapEngine.undo();
      _syncFogBlockers();
      _markDirty();
    }
  }

  function redo() {
    if (typeof MapEngine.redo === 'function') {
      MapEngine.redo();
      _syncFogBlockers();
      _markDirty();
    }
  }

  function canUndo() {
    return typeof MapEngine.canUndo === 'function' ? MapEngine.canUndo() : false;
  }

  function canRedo() {
    return typeof MapEngine.canRedo === 'function' ? MapEngine.canRedo() : false;
  }

  // ── Regions ───────────────────────────────────────────────────────────────────

  function addRegion(name, cells, meta) {
    if (typeof MapEngine.addRegion === 'function') {
      MapEngine.addRegion(name, cells, meta);
      _markDirty();
    }
  }

  function removeRegion(name) {
    if (typeof MapEngine.removeRegion === 'function') {
      MapEngine.removeRegion(name);
      _markDirty();
    }
  }

  // ── Drawing tools ─────────────────────────────────────────────────────────────

  function drawLine(r1, c1, r2, c2) {
    if (typeof MapEngine.drawLine === 'function') {
      MapEngine.drawLine(r1, c1, r2, c2, _selectedTile);
      _syncFogBlockers();
      _markDirty();
    }
  }

  function drawCircle(cr, cc, radius) {
    if (typeof MapEngine.drawCircle === 'function') {
      MapEngine.drawCircle(cr, cc, radius, _selectedTile);
      _syncFogBlockers();
      _markDirty();
    }
  }

  // ── Public API – core (backward-compatible) ───────────────────────────────────

  function fill(tileKey) {
    MapEngine.fillMap(tileKey);
    _syncFogBlockers();
    _markDirty();
  }

  function resize(newCols, newRows) {
    MapEngine.resize(newCols, newRows);
    _syncCanvasSize();
    TokenSystem.setMapSize(MapEngine.width, MapEngine.height);
    _reinitFog();
    _markDirty();
  }

  function serialize() {
    return {
      ...MapEngine.serialize(),
      tokens: TokenSystem.serialize(),
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
    if (data.tokens) TokenSystem.deserialize(data.tokens);
    _reinitFog();
    _markDirty();
  }

  function exportPNG() {
    render();
    return _canvas.toDataURL('image/png');
  }

  // ── Public API – tools & view ─────────────────────────────────────────────────

  function setTool(tool) { UIControls.activeTool = tool; }
  function toggleGrid()  { UIControls.showGrid = !UIControls.showGrid; }
  function resetView()   { UIControls.resetView(); }

  // ── Public API – tokens ───────────────────────────────────────────────────────

  function addToken(characterId, name, avatar, hp, maxHp, gridCol, gridRow) {
    const id = TokenSystem.addToken(characterId, name, avatar, hp, maxHp, gridCol, gridRow);
    const token = TokenSystem.getToken(id);
    _updateTokenVision(token);
    _markDirty();
    return id;
  }

  function removeToken(id) {
    TokenSystem.removeToken(id);
    if (_hasFog) FogOfWar.removeVisionSource(id);
    _markDirty();
  }

  function removeTokenByCharId(cid) {
    // Find the token id before removal for fog cleanup
    const tokens = TokenSystem.getAll();
    let target = null;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].characterId === cid) { target = tokens[i]; break; }
    }
    TokenSystem.removeTokenByCharId(cid);
    if (_hasFog && target) FogOfWar.removeVisionSource(target.id);
    _markDirty();
  }

  function getTokens()                 { return TokenSystem.getAll(); }
  function getSelectedToken()          { return TokenSystem.getSelected(); }

  function triggerTokenAction(tokenId, actionKey) {
    TokenSystem.triggerAction(tokenId, actionKey);
    _markDirty();
  }

  // ── Public API – combat ───────────────────────────────────────────────────────

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

    // Callbacks
    onLog,
    onTokenSelect,
    setCombatCallback,

    // Fog of war
    toggleFog,
    isFogEnabled,
    setFogEnabled,

    // Particle effects
    spawnEffect,
    spawnBurst,

    // Undo / Redo
    undo,
    redo,
    canUndo,
    canRedo,

    // Regions
    addRegion,
    removeRegion,

    // Drawing tools
    drawLine,
    drawCircle,

    // Sub-system access (for advanced use)
    get tokenSystem()  { return TokenSystem; },
    get combatSystem() { return CombatSystem; },
    get engine()       { return MapEngine; },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MapEditor;
}
