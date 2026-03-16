/**
 * tokenSystem.js – Token Management System
 * Manages character tokens on the tactical map:
 *   – placement, drag-to-move, snap-to-grid
 *   – HP bar rendering, selection highlight
 *   – pointer event handling (consumed before the tile editor)
 *
 * Token data shape:
 * {
 *   id:            number,
 *   characterId:   number,
 *   x:             number,   // grid column
 *   y:             number,   // grid row
 *   hp:            number,
 *   maxHp:         number,
 *   name:          string,
 *   avatar:        string,
 *   statusEffects: string[]
 * }
 */

const TokenSystem = (() => {
  'use strict';

  let _tokens      = [];
  let _selectedId  = null;
  let _dragState   = null;
  let _mapWidth    = 20;
  let _mapHeight   = 15;
  let _onSelect    = null;   // (id|null) => void
  let _onAction    = null;   // (tokenId, actionKey, message) => void

  // ── Initialise ────────────────────────────────────────────────────────────

  function init(mapWidth, mapHeight, selectCb, actionCb) {
    _mapWidth  = mapWidth;
    _mapHeight = mapHeight;
    _onSelect  = selectCb;
    _onAction  = actionCb;
  }

  function setMapSize(w, h) {
    _mapWidth  = Math.max(1, w);
    _mapHeight = Math.max(1, h);
  }

  // ── Token CRUD ────────────────────────────────────────────────────────────

  function addToken(characterId, name, avatar, hp, maxHp, gridCol, gridRow) {
    // One token per character on the map
    _tokens = _tokens.filter(t => t.characterId !== characterId);
    const id = Date.now() + Math.floor(Math.random() * 1e6);
    const resolvedMaxHp = maxHp !== undefined ? maxHp : (hp !== undefined ? hp : 10);
    const resolvedHp    = hp    !== undefined ? hp    : resolvedMaxHp;
    _tokens.push({
      id,
      characterId,
      x:             Math.max(0, Math.min(_mapWidth  - 1, gridCol || 0)),
      y:             Math.max(0, Math.min(_mapHeight - 1, gridRow || 0)),
      hp:            resolvedHp,
      maxHp:         resolvedMaxHp,
      name,
      avatar,
      statusEffects: [],
    });
    return id;
  }

  function removeToken(id) {
    _tokens = _tokens.filter(t => t.id !== id);
    if (_selectedId === id) {
      _selectedId = null;
      if (_onSelect) _onSelect(null);
    }
  }

  function removeTokenByCharId(characterId) {
    const t = _tokens.find(t => t.characterId === characterId);
    if (t) removeToken(t.id);
  }

  function getToken(id)  { return _tokens.find(t => t.id === id) || null; }
  function getAll()      { return _tokens; }
  function getSelected() { return _selectedId ? getToken(_selectedId) : null; }

  // ── Selection ─────────────────────────────────────────────────────────────

  function selectToken(id) {
    _selectedId = id;
    if (_onSelect) _onSelect(id);
  }

  function deselectAll() {
    _selectedId = null;
    if (_onSelect) _onSelect(null);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function triggerAction(tokenId, actionKey) {
    const t = getToken(tokenId);
    if (!t || !_onAction) return;
    const LABELS = {
      move:    `${t.name} moves.`,
      attack:  `${t.name} attacks! ⚔️`,
      spell:   `${t.name} casts a spell! ✨`,
      useItem: `${t.name} uses an item. 🎒`,
      endTurn: `${t.name} ends their turn. ⏭`,
    };
    _onAction(tokenId, actionKey, LABELS[actionKey] || `${t.name}: ${actionKey}`);
  }

  function modifyHp(tokenId, delta) {
    const t = getToken(tokenId);
    if (!t) return;
    t.hp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
  }

  // ── Pointer handling (world-space coordinates) ────────────────────────────

  /**
   * Returns true if the event was consumed (token found at world position).
   * @param {number} worldX  – pointer X in world space (before scale)
   * @param {number} worldY  – pointer Y in world space (before scale)
   * @param {number} tileSize
   */
  function handlePointerDown(worldX, worldY, tileSize) {
    const col = Math.floor(worldX / tileSize);
    const row = Math.floor(worldY / tileSize);
    for (let i = _tokens.length - 1; i >= 0; i--) {
      const t = _tokens[i];
      if (t.x === col && t.y === row) {
        selectToken(t.id);
        _dragState = { tokenId: t.id, origX: t.x, origY: t.y };
        return true;
      }
    }
    return false;
  }

  function handlePointerMove(worldX, worldY, tileSize) {
    if (!_dragState) return false;
    const col = Math.max(0, Math.min(_mapWidth  - 1, Math.floor(worldX / tileSize)));
    const row = Math.max(0, Math.min(_mapHeight - 1, Math.floor(worldY / tileSize)));
    const t = getToken(_dragState.tokenId);
    if (t) { t.x = col; t.y = row; }
    return true;
  }

  function handlePointerUp() {
    if (!_dragState) return false;
    const t = getToken(_dragState.tokenId);
    if (t && _onAction) {
      if (t.x !== _dragState.origX || t.y !== _dragState.origY) {
        _onAction(_dragState.tokenId, 'move', `${t.name} moved to (${t.x}, ${t.y}).`);
      }
    }
    _dragState = null;
    return true;
  }

  function isDragging() { return _dragState !== null; }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function drawTokens(ctx, tileSize) {
    for (const token of _tokens) {
      const x  = token.x * tileSize;
      const y  = token.y * tileSize;
      const TS = tileSize;
      const isSelected = token.id === _selectedId;

      // Selection border / highlight
      if (isSelected) {
        ctx.fillStyle = 'rgba(200,168,75,0.14)';
        ctx.fillRect(x, y, TS, TS);
        ctx.strokeStyle = '#c8a84b';
        ctx.lineWidth   = 2.5;
        ctx.strokeRect(x + 1, y + 1, TS - 2, TS - 2);
      }

      // HP bar (above the token cell)
      const hpPct = token.maxHp > 0 ? token.hp / token.maxHp : 0;
      const barH  = Math.max(4, Math.floor(TS * 0.12));
      const barY  = y - barH - 2;
      ctx.fillStyle = '#222';
      ctx.fillRect(x, barY, TS, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#2d6a2d' : hpPct > 0.25 ? '#b05a00' : '#8b1a1a';
      ctx.fillRect(x, barY, Math.round(TS * hpPct), barH);

      // Circular background
      const cx = x + TS / 2, cy = y + TS / 2, r = TS / 2 - 3;
      ctx.fillStyle = isSelected ? '#2e2010' : '#1a1209';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#c8a84b' : '#5a3e1b';
      ctx.lineWidth   = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      // Avatar emoji
      ctx.font         = `${Math.floor(TS * 0.48)}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = 'rgba(255,255,255,0.92)';
      ctx.fillText(token.avatar, cx, cy);

      // Name label (below the token cell)
      const labelSz = Math.max(9, Math.floor(TS * 0.20));
      ctx.font         = `bold ${labelSz}px sans-serif`;
      ctx.lineWidth    = 3;
      ctx.strokeStyle  = 'rgba(0,0,0,0.80)';
      ctx.strokeText(token.name.slice(0, 10), cx, y + TS + labelSz);
      ctx.fillStyle    = 'rgba(240,230,200,0.92)';
      ctx.fillText(token.name.slice(0, 10),   cx, y + TS + labelSz);
    }
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  function serialize() {
    return _tokens.map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
    }));
  }

  function deserialize(arr) {
    _tokens    = (arr || []).map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
    }));
    _selectedId = null;
  }

  return {
    get tokens()     { return _tokens; },
    get selectedId() { return _selectedId; },
    init,
    setMapSize,
    addToken,
    removeToken,
    removeTokenByCharId,
    getToken,
    getAll,
    getSelected,
    selectToken,
    deselectAll,
    triggerAction,
    modifyHp,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    isDragging,
    drawTokens,
    serialize,
    deserialize,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TokenSystem;
}
