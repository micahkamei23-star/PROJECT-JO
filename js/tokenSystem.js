/**
 * tokenSystem.js – Token Management System
 * Manages character tokens on the tactical map:
 *   – placement, drag-to-move, snap-to-grid
 *   – HP bar rendering, selection highlight, aura, conditions
 *   – pointer event handling (consumed before the tile editor)
 *   – smooth movement (lerp), vision cone
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
 *   statusEffects: string[],
 *   rotation:      number,   // degrees (default 0)
 *   scale:         number,   // default 1
 *   tempHp:        number,   // default 0
 *   conditions:    string[], // e.g. ['poisoned', 'blinded']
 *   visionRadius:  number,   // in tiles (default 6)
 *   darkvision:    number,   // in tiles (default 0)
 *   auraRadius:    number,   // in tiles (default 0)
 *   auraColor:     string,   // CSS color (default '#c8a84b')
 *   faction:       string,   // 'ally'|'enemy'|'neutral' (default 'ally')
 *   animState:     string,   // 'idle'|'moving'|'attacking'|'casting' (default 'idle')
 *   lightRadius:   number,   // light source radius (default 0)
 *   lerpPosition:  object|null // { fromX, fromY, toX, toY, t, duration }
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
      rotation:      0,
      scale:         1,
      tempHp:        0,
      conditions:    [],
      visionRadius:  6,
      darkvision:    0,
      auraRadius:    0,
      auraColor:     '#c8a84b',
      faction:       'ally',
      animState:     'idle',
      lightRadius:   0,
      lerpPosition:  null,
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

  const COND_ICONS = {
    blinded: '🙈', charmed: '💖', deafened: '🔇', frightened: '😨',
    grappled: '🤝', incapacitated: '💫', invisible: '👻', paralyzed: '⚡',
    petrified: '🪨', poisoned: '☠️', prone: '🔻', restrained: '⛓️',
    stunned: '💥', unconscious: '💤', exhaustion: '😩',
  };

  function drawTokens(ctx, tileSize) {
    for (const token of _tokens) {
      const lp = token.lerpPosition;
      const useL = lp && typeof lp.t === 'number' && lp.t < 1;
      const drawX = useL ? (lp.fromX + (lp.toX - lp.fromX) * lp.t) : token.x * tileSize;
      const drawY = useL ? (lp.fromY + (lp.toY - lp.fromY) * lp.t) : token.y * tileSize;
      const TS = tileSize;
      const isSelected = token.id === _selectedId;
      const cx = drawX + TS / 2, cy = drawY + TS / 2;

      // Aura (soft radial gradient)
      const auraR = token.auraRadius || 0;
      if (auraR > 0) {
        const auraPixels = auraR * tileSize;
        const grad = ctx.createRadialGradient(cx, cy, TS / 2, cx, cy, auraPixels);
        const aColor = token.auraColor || '#c8a84b';
        grad.addColorStop(0, aColor + '44');
        grad.addColorStop(1, aColor + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, auraPixels, 0, Math.PI * 2);
        ctx.fill();
      }

      // Faction-based selection ring colour
      const faction = token.faction || 'ally';
      const factionColors = { ally: '#2d6a2d', enemy: '#8b1a1a', neutral: '#b0a020' };
      const ringColor = isSelected
        ? (factionColors[faction] || '#c8a84b')
        : '#5a3e1b';

      // Selection border / highlight
      if (isSelected) {
        ctx.fillStyle = 'rgba(200,168,75,0.14)';
        ctx.fillRect(drawX, drawY, TS, TS);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth   = 2.5;
        ctx.strokeRect(drawX + 1, drawY + 1, TS - 2, TS - 2);
      }

      // Temp HP bar (cyan, above normal HP bar)
      const tempHp = token.tempHp || 0;
      const barH  = Math.max(4, Math.floor(TS * 0.12));
      if (tempHp > 0) {
        const tempBarY = drawY - barH * 2 - 4;
        const tempPct = Math.min(1, tempHp / (token.maxHp || 1));
        ctx.fillStyle = '#222';
        ctx.fillRect(drawX, tempBarY, TS, barH);
        ctx.fillStyle = '#00cccc';
        ctx.fillRect(drawX, tempBarY, Math.round(TS * tempPct), barH);
      }

      // HP bar (above the token cell)
      const hpPct = token.maxHp > 0 ? token.hp / token.maxHp : 0;
      const barY  = drawY - barH - 2;
      ctx.fillStyle = '#222';
      ctx.fillRect(drawX, barY, TS, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#2d6a2d' : hpPct > 0.25 ? '#b05a00' : '#8b1a1a';
      ctx.fillRect(drawX, barY, Math.round(TS * hpPct), barH);

      // Circular background
      const r = TS / 2 - 3;
      ctx.fillStyle = isSelected ? '#2e2010' : '#1a1209';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isSelected ? ringColor : '#5a3e1b';
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
      ctx.strokeText(token.name.slice(0, 10), cx, drawY + TS + labelSz);
      ctx.fillStyle    = 'rgba(240,230,200,0.92)';
      ctx.fillText(token.name.slice(0, 10),   cx, drawY + TS + labelSz);

      // Condition icons around the base
      const conditions = token.conditions || [];
      if (conditions.length > 0) {
        const iconSize = Math.max(8, Math.floor(TS * 0.22));
        ctx.font = `${iconSize}px serif`;
        const angleStep = (Math.PI * 2) / conditions.length;
        const iconR = r + iconSize * 0.6;
        for (let i = 0; i < conditions.length; i++) {
          const angle = -Math.PI / 2 + angleStep * i;
          const ix = cx + Math.cos(angle) * iconR;
          const iy = cy + Math.sin(angle) * iconR;
          ctx.fillText(COND_ICONS[conditions[i]] || '❓', ix, iy);
        }
      }
    }
  }

  // ── Smooth movement (lerp) ────────────────────────────────────────────────

  /** Advance interpolation for all tokens with active lerps. */
  function updateLerp(dt) {
    for (const token of _tokens) {
      const lp = token.lerpPosition;
      if (!lp || lp.t >= 1) continue;
      const dur = lp.duration || 0.3;
      lp.t = Math.min(1, lp.t + dt / dur);
      if (lp.t >= 1) {
        token.x = Math.round(lp.toX / (lp._tileSize || 1));
        token.y = Math.round(lp.toY / (lp._tileSize || 1));
      }
    }
  }

  // ── Vision cone ───────────────────────────────────────────────────────────

  /** Draw a translucent vision cone for a token. */
  function drawVisionCone(ctx, token, tileSize) {
    if (!token) return;
    const rot = (token.rotation || 0) * Math.PI / 180;
    const vr  = (token.visionRadius || 6) * tileSize;
    const cx  = token.x * tileSize + tileSize / 2;
    const cy  = token.y * tileSize + tileSize / 2;
    const halfAngle = Math.PI / 4; // 90-degree cone

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffff88';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, vr, rot - halfAngle, rot + halfAngle);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  function serialize() {
    return _tokens.map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
      conditions:    [...(t.conditions || [])],
    }));
  }

  function deserialize(arr) {
    _tokens    = (arr || []).map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
      conditions:    [...(t.conditions || [])],
      rotation:      t.rotation      || 0,
      scale:         t.scale         || 1,
      tempHp:        t.tempHp        || 0,
      visionRadius:  t.visionRadius  || 6,
      darkvision:    t.darkvision    || 0,
      auraRadius:    t.auraRadius    || 0,
      auraColor:     t.auraColor     || '#c8a84b',
      faction:       t.faction       || 'ally',
      animState:     t.animState     || 'idle',
      lightRadius:   t.lightRadius   || 0,
      lerpPosition:  t.lerpPosition  || null,
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
    // New API
    updateLerp,
    drawVisionCone,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TokenSystem;
}
