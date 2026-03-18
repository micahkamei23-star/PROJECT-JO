/**
 * tokenSystem.js – Token Management System (AAA Visual Edition)
 * Manages character tokens on the tactical map:
 *   – placement, drag-to-move, snap-to-grid
 *   – HP bar rendering, selection highlight, aura, conditions
 *   – pointer event handling (consumed before the tile editor)
 *   – smooth movement (lerp), vision cone
 *   – Premium visual FX: breathing pulse, faction glow rings, ripple selection,
 *     rune spin, drop shadows, condition badges, light emission, hover halos
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

const _resolvedGameState = (() => {
  if (typeof GameState !== 'undefined') return GameState;
  if (typeof require === 'function') {
    try { return require('./engine/GameState.js'); } catch (e) { return null; }
  }
  return null;
})();

const TokenSystem = (() => {
  'use strict';

  const _GS = _resolvedGameState;

  // ── Core state ────────────────────────────────────────────────────────────

  let _hoveredId  = null;
  let _dragState  = null;
  let _mapWidth   = 20;
  let _mapHeight  = 15;
  let _onSelect   = null;
  let _onAction   = null;

  function _tokensRef() { return _GS._getTokensRef(); }
  function _selectedId() { return _GS._getSelectionRef().selectedTokenId; }

  // ── Visual animation state ─────────────────────────────────────────────────

  /** Global animation time (seconds) advanced by updateVisuals(dt). */
  let _animTime = 0;

  /**
   * Per-token selection VFX: ripple, rune ring spin.
   * Map<id, { rippleRadius, rippleAlpha, runeAngle, hpDisplayed }>
   */
  const _selectionEffects = new Map();

  /**
   * Per-token random breath phase offset so tokens don't pulse in unison.
   * Map<id, number> (radians)
   */
  const _breathPhases = new Map();

  // ── Faction palette ────────────────────────────────────────────────────────

  const FACTION_COLORS = {
    ally:    { ring: '#2d9e4a', glow: '#4aff80', dark: '#1a5c2e' },
    enemy:   { ring: '#cc2222', glow: '#ff4444', dark: '#7a1010' },
    neutral: { ring: '#c8a020', glow: '#ffcc44', dark: '#7a6010' },
  };

  function _factionPalette(faction) {
    return FACTION_COLORS[faction] || FACTION_COLORS.neutral;
  }

  // ── Condition metadata ────────────────────────────────────────────────────

  const COND_ICONS = {
    blinded:       '🙈', charmed:       '💖', deafened:  '🔇',
    frightened:    '😨', grappled:      '🤝', incapacitated: '��',
    invisible:     '👻', paralyzed:     '⚡', petrified: '🪨',
    poisoned:      '☠️', prone:         '🔻', restrained: '⛓️',
    stunned:       '💥', unconscious:   '💤', exhaustion: '😩',
  };

  const COND_COLORS = {
    blinded: '#888888',   charmed:       '#ff69b4', deafened:      '#aaaaaa',
    frightened: '#9900ff', grappled:     '#cc8800', incapacitated: '#ffdd00',
    invisible: '#aaddff', paralyzed:    '#ffff00', petrified:     '#bbbbbb',
    poisoned: '#44dd44',  prone:        '#cc6600', restrained:    '#886600',
    stunned: '#ff8800',   unconscious:  '#6688ff', exhaustion:    '#ff5555',
  };

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
    // Remove existing token with same characterId
    const tokens = _tokensRef();
    for (const tid of Object.keys(tokens)) {
      if (tokens[tid].characterId === characterId) {
        const numId = Number(tid);
        _GS.applyAction({ type: 'token.remove', payload: { id: numId } });
        _breathPhases.delete(numId);
        _selectionEffects.delete(numId);
      }
    }

    const id = Date.now() + Math.floor(Math.random() * 1e6);
    const resolvedMaxHp = maxHp !== undefined ? maxHp : (hp !== undefined ? hp : 10);
    const resolvedHp    = hp    !== undefined ? hp    : resolvedMaxHp;

    _breathPhases.set(id, Math.random() * Math.PI * 2);

    _GS.applyAction({ type: 'token.add', payload: {
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
    }});
    return id;
  }

  function removeToken(id) {
    const wasSelected = _selectedId() === id;
    _GS.applyAction({ type: 'token.remove', payload: { id } });
    _breathPhases.delete(id);
    _selectionEffects.delete(id);
    if (wasSelected && _onSelect) _onSelect(null);
    if (_hoveredId === id) _hoveredId = null;
  }

  function removeTokenByCharId(characterId) {
    const tokens = _tokensRef();
    for (const tid of Object.keys(tokens)) {
      if (tokens[tid].characterId === characterId) {
        removeToken(Number(tid));
        return;
      }
    }
  }

  function getToken(id)  { return _tokensRef()[id] || null; }
  function getAll()      { return Object.values(_tokensRef()); }
  function getSelected() {
    const selId = _selectedId();
    return selId ? getToken(selId) : null;
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  function selectToken(id) {
    _GS.applyAction({ type: 'selection.set', payload: { tokenId: id } });
    _selectionEffects.set(id, {
      rippleRadius: 0,
      rippleAlpha:  0.8,
      runeAngle:    0,
      hpDisplayed:  (getToken(id) || {}).hp || 0,
    });
    if (_onSelect) _onSelect(id);
  }

  function deselectAll() {
    _GS.applyAction({ type: 'selection.set', payload: { tokenId: null } });
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
    const newHp = Math.max(0, Math.min(t.maxHp, t.hp + delta));
    _GS.applyAction({ type: 'token.setHP', payload: { id: tokenId, hp: newHp } });
  }

  // ── Pointer handling ──────────────────────────────────────────────────────

  function handlePointerDown(worldX, worldY, tileSize) {
    const col = Math.floor(worldX / tileSize);
    const row = Math.floor(worldY / tileSize);
    const tokens = Object.values(_tokensRef());
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
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
    _GS.applyAction({ type: 'token.setPosition', payload: { id: _dragState.tokenId, x: col, y: row } });
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

  /**
   * Track hover state for hover-glow FX.
   * Call each frame with the current mouse world position.
   * @param {number} worldX
   * @param {number} worldY
   * @param {number} tileSize
   */
  function handlePointerHover(worldX, worldY, tileSize) {
    const col = Math.floor(worldX / tileSize);
    const row = Math.floor(worldY / tileSize);
    _hoveredId = null;
    const tokens = Object.values(_tokensRef());
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t.x === col && t.y === row) {
        _hoveredId = t.id;
        break;
      }
    }
  }

  function isDragging() { return _dragState !== null; }

  // ── Visual update (call every frame before draw) ──────────────────────────

  /**
   * Advance all visual-only animations.
   * @param {number} dt  seconds since last frame
   */
  function updateVisuals(dt) {
    _animTime += dt;

    // Advance selection FX
    for (const [id, fx] of _selectionEffects) {
      if (!getToken(id)) {
        _selectionEffects.delete(id);
        continue;
      }
      // Ripple expands and fades
      fx.rippleRadius += dt * 60;
      fx.rippleAlpha   = Math.max(0, fx.rippleAlpha - dt * 1.2);
      // Rune ring spins
      fx.runeAngle     = (fx.runeAngle + dt * 1.1) % (Math.PI * 2);

      // Restart ripple when it fully fades (continuous pulse for selected token)
      if (id === _selectedId() && fx.rippleAlpha <= 0) {
        fx.rippleRadius = 0;
        fx.rippleAlpha  = 0.6;
      }
    }
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────

  /** Compute breathing scale multiplier for a given token. */
  function _breathScale(token) {
    const phase  = _breathPhases.get(token.id) || 0;
    const breath = Math.sin(_animTime * 1.4 + phase);
    return 1 + breath * 0.03; // oscillates ±3% around 1
  }

  /** Draw a soft elliptical drop shadow under the token. */
  function _drawShadow(ctx, cx, cy, r) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    const grad = ctx.createRadialGradient(cx, cy + r * 0.3, 0, cx, cy + r * 0.3, r * 1.1);
    grad.addColorStop(0, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.scale(1, 0.45);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, (cy + r * 0.3) / 0.45, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Draw the double faction-colored ring (outer glow + inner solid). */
  function _drawFactionRing(ctx, cx, cy, r, faction, isSelected, isHovered) {
    const palette = _factionPalette(faction);
    const glowAlpha = isSelected ? 0.7 : isHovered ? 0.45 : 0.25;
    const ringWidth = isSelected ? 3.5 : isHovered ? 2.5 : 1.5;

    // Outer glow ring (radial gradient halo)
    const glowR = r + (isSelected ? 10 : isHovered ? 7 : 4);
    const halo = ctx.createRadialGradient(cx, cy, r - 2, cx, cy, glowR);
    halo.addColorStop(0, palette.glow + _alphaHex(glowAlpha));
    halo.addColorStop(1, palette.glow + '00');
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Inner solid ring
    ctx.strokeStyle = palette.ring;
    ctx.lineWidth   = ringWidth;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Second inner ring (slightly smaller, translucent)
    ctx.strokeStyle = palette.glow + _alphaHex(0.5);
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Draw spinning rune glyphs around a selected token. */
  function _drawRuneRing(ctx, cx, cy, r, runeAngle) {
    const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ'];
    const runeR  = r + 14;
    const count  = RUNES.length;
    ctx.save();
    ctx.font      = '8px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < count; i++) {
      const angle = runeAngle + (Math.PI * 2 / count) * i;
      const rx = cx + Math.cos(angle) * runeR;
      const ry = cy + Math.sin(angle) * runeR;
      const glowAlpha = 0.55 + 0.45 * Math.sin(_animTime * 2 + i);
      ctx.globalAlpha = glowAlpha;
      ctx.fillStyle   = '#c8a84b';
      ctx.fillText(RUNES[i], rx, ry);
    }
    ctx.restore();
  }

  /** Draw ripple pulse expanding from a token. */
  function _drawRipple(ctx, cx, cy, rippleRadius, rippleAlpha, factionColor) {
    if (rippleAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = rippleAlpha;
    ctx.strokeStyle = factionColor;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Draw fantasy corner bracket markers around the selected cell. */
  function _drawSelectionBrackets(ctx, drawX, drawY, TS, color) {
    const arm  = Math.max(6, TS * 0.22);
    const inset = 3;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    const corners = [
      [drawX + inset,      drawY + inset,       1,  1],
      [drawX + TS - inset, drawY + inset,       -1,  1],
      [drawX + inset,      drawY + TS - inset,   1, -1],
      [drawX + TS - inset, drawY + TS - inset,  -1, -1],
    ];
    for (const [ox, oy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(ox + arm * dx, oy);
      ctx.lineTo(ox, oy);
      ctx.lineTo(ox, oy + arm * dy);
      ctx.stroke();
    }
  }

  /** Draw the enhanced HP bar with gradient fill and low-HP pulse. */
  function _drawHpBar(ctx, drawX, drawY, TS, hp, maxHp, tempHp) {
    const barH = Math.max(5, Math.floor(TS * 0.13));
    const barY = drawY - barH - 2;

    // Backdrop
    const bgGrad = ctx.createLinearGradient(drawX, barY, drawX, barY + barH);
    bgGrad.addColorStop(0, '#1a1a1a');
    bgGrad.addColorStop(1, '#111111');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(drawX, barY, TS, barH, 2) : ctx.fillRect(drawX, barY, TS, barH);
    ctx.fill();

    if (maxHp > 0) {
      const pct = Math.max(0, Math.min(1, hp / maxHp));
      const fillW = Math.round(TS * pct);

      // HP fill color
      let c0, c1;
      if (pct > 0.5)       { c0 = '#2aaa44'; c1 = '#1a7a30'; }
      else if (pct > 0.25) { c0 = '#dd7700'; c1 = '#aa5500'; }
      else                 { c0 = '#dd2222'; c1 = '#991111'; }

      // Pulse glow when HP is critically low
      if (pct <= 0.25 && fillW > 0) {
        const pulse = 0.3 + 0.3 * Math.abs(Math.sin(_animTime * 4));
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur  = 8;
        ctx.fillStyle   = '#ff3333';
        ctx.fillRect(drawX, barY, fillW, barH);
        ctx.restore();
      }

      if (fillW > 0) {
        const fillGrad = ctx.createLinearGradient(drawX, barY, drawX, barY + barH);
        fillGrad.addColorStop(0, c0);
        fillGrad.addColorStop(0.4, c1);
        fillGrad.addColorStop(1, c1);
        ctx.fillStyle = fillGrad;
        ctx.fillRect(drawX, barY, fillW, barH);

        // Bright highlight strip at top of bar
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(drawX, barY, fillW, Math.max(1, Math.floor(barH * 0.3)));
      }

      // Numeric HP below the bar
      const numSz = Math.max(8, Math.floor(TS * 0.18));
      ctx.font         = `bold ${numSz}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth    = 2.5;
      ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
      ctx.strokeText(`${hp}/${maxHp}`, drawX + TS / 2, barY + barH + 1);
      ctx.fillStyle    = 'rgba(230,230,200,0.85)';
      ctx.fillText(`${hp}/${maxHp}`, drawX + TS / 2, barY + barH + 1);
    }

    // Temp HP bar (cyan, above HP bar)
    if (tempHp > 0) {
      const tempBarY = barY - barH - 2;
      const tempPct  = Math.min(1, tempHp / (maxHp || 1));
      const tempFill = Math.round(TS * tempPct);
      ctx.fillStyle = '#111';
      ctx.fillRect(drawX, tempBarY, TS, barH);
      const tGrad = ctx.createLinearGradient(drawX, tempBarY, drawX, tempBarY + barH);
      tGrad.addColorStop(0, '#00eedd');
      tGrad.addColorStop(1, '#008888');
      ctx.fillStyle = tGrad;
      ctx.fillRect(drawX, tempBarY, tempFill, barH);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(drawX, tempBarY, tempFill, Math.max(1, Math.floor(barH * 0.3)));
    }
  }

  /** Draw a warm light-emission halo for tokens with lightRadius > 0. */
  function _drawLightEmission(ctx, cx, cy, lightRadius, tileSize) {
    const lr   = lightRadius * tileSize;
    const pulse = 1 + 0.03 * Math.sin(_animTime * 2.5);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, lr * pulse);
    grad.addColorStop(0,   'rgba(255,210,100,0.18)');
    grad.addColorStop(0.4, 'rgba(255,170,50,0.08)');
    grad.addColorStop(1,   'rgba(255,140,0,0)');
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle   = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, lr * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Draw glowing condition badge icons around the token. */
  function _drawConditionBadges(ctx, cx, cy, r, conditions) {
    if (!conditions || conditions.length === 0) return;
    const iconSize   = Math.max(9, r * 0.55);
    const badgeR     = r + iconSize * 0.75;
    const angleStep  = (Math.PI * 2) / conditions.length;

    ctx.save();
    ctx.font         = `${iconSize}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < conditions.length; i++) {
      const cond  = conditions[i];
      const angle = -Math.PI / 2 + angleStep * i;
      const bx    = cx + Math.cos(angle) * badgeR;
      const by    = cy + Math.sin(angle) * badgeR;
      const color = COND_COLORS[cond] || '#ffffff';

      // Glow backdrop disc
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.2 * Math.sin(_animTime * 3 + i);
      ctx.shadowColor = color;
      ctx.shadowBlur  = 6;
      ctx.fillText(COND_ICONS[cond] || '❓', bx, by);
      ctx.restore();

      // Crisp icon on top
      ctx.globalAlpha = 1;
      ctx.fillText(COND_ICONS[cond] || '❓', bx, by);
    }
    ctx.restore();
  }

  /** Convert alpha 0–1 to 2-digit hex string. */
  function _alphaHex(a) {
    return Math.round(a * 255).toString(16).padStart(2, '0');
  }

  // ── Main draw pass ────────────────────────────────────────────────────────

  function drawTokens(ctx, tileSize) {
    const tokens = Object.values(_tokensRef());
    for (const token of tokens) {
      const lp   = token.lerpPosition;
      const useL = lp && typeof lp.t === 'number' && lp.t < 1;
      const baseX = useL
        ? lp.fromX + (lp.toX - lp.fromX) * lp.t
        : token.x * tileSize;
      const baseY = useL
        ? lp.fromY + (lp.toY - lp.fromY) * lp.t
        : token.y * tileSize;

      const TS         = tileSize;
      const isSelected = token.id === _selectedId();
      const isHovered  = token.id === _hoveredId && !isSelected;
      const cx         = baseX + TS / 2;
      const cy         = baseY + TS / 2;
      const breath     = _breathScale(token);
      const r          = (TS / 2 - 3) * (token.scale || 1) * breath;
      const faction    = token.faction || 'ally';
      const palette    = _factionPalette(faction);
      const fx         = _selectionEffects.get(token.id);

      // ── Aura ────────────────────────────────────────────────────────────
      const auraR = token.auraRadius || 0;
      if (auraR > 0) {
        const auraPixels = auraR * tileSize;
        const grad = ctx.createRadialGradient(cx, cy, TS / 2, cx, cy, auraPixels);
        const ac   = token.auraColor || '#c8a84b';
        grad.addColorStop(0, ac + '44');
        grad.addColorStop(1, ac + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, auraPixels, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Light emission ───────────────────────────────────────────────────
      if ((token.lightRadius || 0) > 0) {
        _drawLightEmission(ctx, cx, cy, token.lightRadius, tileSize);
      }

      // ── Drop shadow ──────────────────────────────────────────────────────
      _drawShadow(ctx, cx, cy, r);

      // ── Hover halo ───────────────────────────────────────────────────────
      if (isHovered) {
        const haloGrad = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 14);
        haloGrad.addColorStop(0, palette.glow + '88');
        haloGrad.addColorStop(1, palette.glow + '00');
        ctx.save();
        ctx.globalAlpha = 0.7 + 0.2 * Math.sin(_animTime * 3);
        ctx.fillStyle   = haloGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── Selection ripple ─────────────────────────────────────────────────
      if (isSelected && fx) {
        _drawRipple(ctx, cx, cy, fx.rippleRadius, fx.rippleAlpha, palette.ring);
      }

      // ── Selection brackets ────────────────────────────────────────────────
      if (isSelected) {
        _drawSelectionBrackets(ctx, baseX, baseY, TS, palette.glow);
      }

      // ── HP + TempHP bars ─────────────────────────────────────────────────
      _drawHpBar(ctx, baseX, baseY, TS, token.hp, token.maxHp, token.tempHp || 0);

      // ── Token body: circular background ──────────────────────────────────
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(breath * (token.scale || 1), breath * (token.scale || 1));

      const bgGrad = ctx.createRadialGradient(0, -r * 0.2, r * 0.1, 0, 0, r);
      bgGrad.addColorStop(0, isSelected ? '#3a2a10' : '#221810');
      bgGrad.addColorStop(1, isSelected ? '#1e1408' : '#100c04');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ── Faction double-ring ───────────────────────────────────────────────
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(breath * (token.scale || 1), breath * (token.scale || 1));
      _drawFactionRing(ctx, 0, 0, r, faction, isSelected, isHovered);
      ctx.restore();

      // ── Avatar emoji ─────────────────────────────────────────────────────
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(breath * (token.scale || 1), breath * (token.scale || 1));
      const emojiSize = Math.floor(TS * 0.48);
      ctx.font         = `${emojiSize}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      // Subtle text glow
      ctx.shadowColor  = 'rgba(255,220,150,0.5)';
      ctx.shadowBlur   = 4;
      ctx.fillStyle    = 'rgba(255,255,255,0.93)';
      ctx.fillText(token.avatar, 0, 0);
      ctx.restore();

      // ── Spinning rune ring (selected only) ────────────────────────────────
      if (isSelected && fx) {
        _drawRuneRing(ctx, cx, cy, r, fx.runeAngle);
      }

      // ── Name label ────────────────────────────────────────────────────────
      const labelSz = Math.max(9, Math.floor(TS * 0.20));
      const labelY  = baseY + TS + labelSz + 2;
      ctx.font         = `bold ${labelSz}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth    = 3;
      ctx.strokeStyle  = 'rgba(0,0,0,0.85)';
      ctx.strokeText(token.name.slice(0, 10), cx, labelY);
      ctx.fillStyle    = isSelected
        ? palette.glow
        : 'rgba(240,230,200,0.92)';
      ctx.fillText(token.name.slice(0, 10), cx, labelY);

      // ── Condition badges ──────────────────────────────────────────────────
      _drawConditionBadges(ctx, cx, cy, r, token.conditions || []);
    }
  }

  // ── Smooth movement (lerp) ────────────────────────────────────────────────

  function updateLerp(dt) {
    const tokens = Object.values(_tokensRef());
    for (const token of tokens) {
      const lp = token.lerpPosition;
      if (!lp || lp.t >= 1) continue;
      const dur = lp.duration || 0.3;
      lp.t = Math.min(1, lp.t + dt / dur);
      if (lp.t >= 1) {
        const newX = Math.round(lp.toX / (lp._tileSize || 1));
        const newY = Math.round(lp.toY / (lp._tileSize || 1));
        _GS.applyAction({ type: 'token.setPosition', payload: { id: token.id, x: newX, y: newY } });
      }
    }
  }

  // ── Vision cone ───────────────────────────────────────────────────────────

  /**
   * Draw an enhanced vision cone with gradient fade and darkvision overlay.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} token
   * @param {number} tileSize
   */
  function drawVisionCone(ctx, token, tileSize) {
    if (!token) return;
    const rot       = (token.rotation || 0) * Math.PI / 180;
    const vr        = (token.visionRadius || 6) * tileSize;
    const cx        = token.x * tileSize + tileSize / 2;
    const cy        = token.y * tileSize + tileSize / 2;
    const halfAngle = Math.PI / 4; // 90° cone

    ctx.save();

    // Primary vision cone with gradient fade at edges
    const vGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, vr);
    vGrad.addColorStop(0,    'rgba(255,255,180,0.22)');
    vGrad.addColorStop(0.65, 'rgba(255,255,100,0.12)');
    vGrad.addColorStop(1,    'rgba(255,255,0,0)');

    ctx.globalAlpha = 1;
    ctx.fillStyle   = vGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, vr, rot - halfAngle, rot + halfAngle);
    ctx.closePath();
    ctx.fill();

    // Darkvision: grayscale desaturated secondary range
    const dv = (token.darkvision || 0) * tileSize;
    if (dv > 0) {
      ctx.save();
      const dvGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dv);
      dvGrad.addColorStop(0,    'rgba(180,180,220,0.10)');
      dvGrad.addColorStop(0.7,  'rgba(150,150,200,0.05)');
      dvGrad.addColorStop(1,    'rgba(100,100,180,0)');
      ctx.globalAlpha = 0.7;
      ctx.fillStyle   = dvGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, dv, rot - halfAngle, rot + halfAngle);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Thin bright edge arc
    ctx.globalAlpha  = 0.18;
    ctx.strokeStyle  = '#ffffaa';
    ctx.lineWidth    = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, vr, rot - halfAngle, rot + halfAngle);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  function serialize() {
    return Object.values(_tokensRef()).map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
      conditions:    [...(t.conditions    || [])],
    }));
  }

  function deserialize(arr) {
    const tokens = (arr || []).map(t => ({
      ...t,
      statusEffects: [...(t.statusEffects || [])],
      conditions:    [...(t.conditions    || [])],
      rotation:      t.rotation     || 0,
      scale:         t.scale        || 1,
      tempHp:        t.tempHp       || 0,
      visionRadius:  t.visionRadius || 6,
      darkvision:    t.darkvision   || 0,
      auraRadius:    t.auraRadius   || 0,
      auraColor:     t.auraColor    || '#c8a84b',
      faction:       t.faction      || 'ally',
      animState:     t.animState    || 'idle',
      lightRadius:   t.lightRadius  || 0,
      lerpPosition:  t.lerpPosition || null,
    }));
    _GS.applyAction({ type: 'token.bulkSet', payload: { tokens } });
    // Re-seed breath phases for deserialized tokens
    for (const t of tokens) {
      if (!_breathPhases.has(t.id)) {
        _breathPhases.set(t.id, Math.random() * Math.PI * 2);
      }
    }
    _GS.applyAction({ type: 'selection.set', payload: { tokenId: null } });
    _selectionEffects.clear();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    get tokens()     { return Object.values(_tokensRef()); },
    get selectedId() { return _selectedId(); },

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
    handlePointerHover,
    isDragging,

    drawTokens,
    updateLerp,
    updateVisuals,
    drawVisionCone,

    serialize,
    deserialize,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TokenSystem;
}
