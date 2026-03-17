/**
 * FeedbackSystem.js – Visual Feedback System
 *
 * Provides immediate, subtle visual responses to:
 *   – hover and click interactions on UI elements
 *   – token selection on the map
 *   – game actions: damage, heal, move, spell cast, death
 *
 * Design rules:
 *   – Effects are fast (< 400 ms) and non-persistent
 *   – Integrates with EventBus for game-action feedback
 *   – Hooks into tokenSystem and map interactions via EventBus events
 *   – No heavy particle systems; no looping animations
 *
 * @module FeedbackSystem
 */

const FeedbackSystem = (() => {
  'use strict';

  // ── Keyframe registry ─────────────────────────────────────────────────────

  /** CSS class → keyframe name for one-shot effects. */
  const FLASH_CLASSES = {
    damage:    'fb-flash-damage',
    heal:      'fb-flash-heal',
    select:    'fb-flash-select',
    click:     'fb-flash-click',
    move:      'fb-flash-move',
    spell:     'fb-flash-spell',
    death:     'fb-flash-death',
  };

  /** Duration (ms) for each flash type. */
  const FLASH_DURATION = {
    damage: 350,
    heal:   350,
    select: 250,
    click:  180,
    move:   220,
    spell:  380,
    death:  500,
  };

  // ── Style injection ───────────────────────────────────────────────────────

  let _stylesInjected = false;

  function _injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;

    const css = `
/* FeedbackSystem – one-shot flash effects */
@keyframes fb-flash-damage {
  0%   { outline: 2px solid #ff4444; box-shadow: 0 0 12px rgba(255,68,68,.7); }
  60%  { outline: 2px solid #ff4444; box-shadow: 0 0 20px rgba(255,68,68,.5); }
  100% { outline: 2px solid transparent; box-shadow: none; }
}
@keyframes fb-flash-heal {
  0%   { outline: 2px solid #44dd66; box-shadow: 0 0 12px rgba(68,221,102,.7); }
  60%  { outline: 2px solid #44dd66; box-shadow: 0 0 20px rgba(68,221,102,.5); }
  100% { outline: 2px solid transparent; box-shadow: none; }
}
@keyframes fb-flash-select {
  0%   { outline: 2px solid #c8a84b; box-shadow: 0 0 10px rgba(200,168,75,.7); }
  100% { outline: 2px solid transparent; box-shadow: none; }
}
@keyframes fb-flash-click {
  0%   { opacity: .7; transform: scale(.97); }
  100% { opacity: 1;  transform: scale(1); }
}
@keyframes fb-flash-move {
  0%   { outline: 2px solid #4a9eff; box-shadow: 0 0 10px rgba(74,158,255,.6); }
  100% { outline: 2px solid transparent; box-shadow: none; }
}
@keyframes fb-flash-spell {
  0%   { outline: 2px solid #cc88ff; box-shadow: 0 0 14px rgba(204,136,255,.7); }
  60%  { outline: 2px solid #cc88ff; box-shadow: 0 0 22px rgba(204,136,255,.5); }
  100% { outline: 2px solid transparent; box-shadow: none; }
}
@keyframes fb-flash-death {
  0%   { opacity: 1; outline: 2px solid #888; filter: grayscale(0); }
  50%  { opacity: .5; filter: grayscale(.6); }
  100% { opacity: 1; outline: 2px solid transparent; filter: grayscale(0); }
}
.fb-flash-damage { animation: fb-flash-damage var(--fb-dur, .35s) ease-out forwards; }
.fb-flash-heal   { animation: fb-flash-heal   var(--fb-dur, .35s) ease-out forwards; }
.fb-flash-select { animation: fb-flash-select var(--fb-dur, .25s) ease-out forwards; }
.fb-flash-click  { animation: fb-flash-click  var(--fb-dur, .18s) ease-out forwards; }
.fb-flash-move   { animation: fb-flash-move   var(--fb-dur, .22s) ease-out forwards; }
.fb-flash-spell  { animation: fb-flash-spell  var(--fb-dur, .38s) ease-out forwards; }
.fb-flash-death  { animation: fb-flash-death  var(--fb-dur, .5s)  ease-out forwards; }

/* Canvas overlay for map feedback */
#fb-canvas-overlay {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 20;
}

/* Floating damage/heal label */
.fb-label {
  position: absolute;
  font-family: var(--font-fantasy, Georgia, serif);
  font-size: .9rem;
  font-weight: 700;
  pointer-events: none;
  z-index: 30;
  animation: fb-label-float .7s ease-out forwards;
  white-space: nowrap;
  text-shadow: 0 1px 4px rgba(0,0,0,.7);
}
.fb-label.damage { color: #ff6666; }
.fb-label.heal   { color: #66ee88; }
@keyframes fb-label-float {
  0%   { opacity: 1; transform: translateY(0); }
  80%  { opacity: .8; }
  100% { opacity: 0; transform: translateY(-28px); }
}
`;

    const style = document.createElement('style');
    style.id = 'feedback-system-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── State ─────────────────────────────────────────────────────────────────

  let _mapWrapper = null;   // #map-canvas-wrapper element
  let _mapCanvas  = null;   // #map-canvas element
  let _tileSize   = 40;     // kept in sync with MapEditor.TILE_SIZE

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Apply a one-shot CSS flash class to an element.
   * @param {Element} el
   * @param {string}  type - key of FLASH_CLASSES
   */
  function _flashElement(el, type) {
    if (!el || !FLASH_CLASSES[type]) return;
    const cls      = FLASH_CLASSES[type];
    const duration = FLASH_DURATION[type] || 350;
    el.style.setProperty('--fb-dur', `${duration}ms`);
    el.classList.remove(cls);
    // Force reflow so animation restarts if called twice quickly
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => {
      el.classList.remove(cls);
      el.style.removeProperty('--fb-dur');
    }, duration + 50);
  }

  /**
   * Spawn a floating label (damage / heal) anchored to a map tile position.
   * @param {string} text
   * @param {string} type  - 'damage' | 'heal'
   * @param {number} tileX - grid column
   * @param {number} tileY - grid row
   */
  function _spawnFloatingLabel(text, type, tileX, tileY) {
    if (!_mapWrapper || !_mapCanvas) return;
    const wrapperRect = _mapWrapper.getBoundingClientRect();
    const canvasRect  = _mapCanvas.getBoundingClientRect();

    const px = canvasRect.left - wrapperRect.left + (tileX + 0.5) * _tileSize;
    const py = canvasRect.top  - wrapperRect.top  + tileY * _tileSize;

    const label = document.createElement('div');
    label.className = `fb-label ${type}`;
    label.textContent = text;
    label.style.left = `${px}px`;
    label.style.top  = `${py}px`;
    label.style.transform = 'translateX(-50%)';
    _mapWrapper.style.position = 'relative';
    _mapWrapper.appendChild(label);
    setTimeout(() => label.remove(), 750);
  }

  // ── Token element lookup ──────────────────────────────────────────────────

  /**
   * Find the token-list-item element matching a token id.
   * @param {number} tokenId
   * @returns {Element|null}
   */
  function _tokenListItem(tokenId) {
    return document.querySelector(
      `[data-id="${tokenId}"].token-list-item, [data-id="${tokenId}"].token-item`
    );
  }

  // ── Public feedback API ───────────────────────────────────────────────────

  /**
   * Flash a UI element on click (attached to interactive elements).
   * @param {Element} el
   */
  function onClickFeedback(el) {
    _flashElement(el, 'click');
  }

  /**
   * Feedback for token selection.
   * @param {number} tokenId
   */
  function onTokenSelect(tokenId) {
    const el = _tokenListItem(tokenId);
    if (el) _flashElement(el, 'select');
  }

  /**
   * Feedback for damage dealt to a token.
   * @param {number} tokenId
   * @param {number} amount
   * @param {{x:number, y:number}|null} [pos]
   */
  function onDamage(tokenId, amount, pos) {
    const el = _tokenListItem(tokenId);
    if (el) _flashElement(el, 'damage');
    if (pos) _spawnFloatingLabel(`−${amount}`, 'damage', pos.x, pos.y);
  }

  /**
   * Feedback for healing a token.
   * @param {number} tokenId
   * @param {number} amount
   * @param {{x:number, y:number}|null} [pos]
   */
  function onHeal(tokenId, amount, pos) {
    const el = _tokenListItem(tokenId);
    if (el) _flashElement(el, 'heal');
    if (pos) _spawnFloatingLabel(`+${amount}`, 'heal', pos.x, pos.y);
  }

  /**
   * Feedback for token death.
   * @param {number} tokenId
   */
  function onDeath(tokenId) {
    const el = _tokenListItem(tokenId);
    if (el) _flashElement(el, 'death');
  }

  /**
   * Feedback for token move.
   * @param {number} tokenId
   */
  function onMove(tokenId) {
    const el = _tokenListItem(tokenId);
    if (el) _flashElement(el, 'move');
  }

  /**
   * Feedback for spell cast.
   * @param {number} tokenId
   */
  function onSpell(tokenId) {
    const el = _tokenListItem(tokenId);
    if (el) _flashElement(el, 'spell');
  }

  // ── EventBus integration ──────────────────────────────────────────────────

  /**
   * Wire FeedbackSystem into an EventBus instance.
   * @param {Object} bus - EventBus with .on(event, cb)
   */
  function hookEventBus(bus) {
    if (!bus || typeof bus.on !== 'function') return;

    bus.on('combat:hit',  (data) => {
      if (!data) return;
      const amt = data.damage || data.amount || 0;
      const pos = data.token ? { x: data.token.x, y: data.token.y } : null;
      onDamage(data.tokenId || data.id, amt, pos);
    });

    bus.on('combat:heal', (data) => {
      if (!data) return;
      const amt = data.amount || data.heal || 0;
      const pos = data.token ? { x: data.token.x, y: data.token.y } : null;
      onHeal(data.tokenId || data.id, amt, pos);
    });

    bus.on('combat:death', (data) => {
      if (!data) return;
      onDeath(data.tokenId || data.id);
    });

    bus.on('token:move', (data) => {
      if (!data) return;
      onMove(data.tokenId || data.id);
    });

    bus.on('token:select', (data) => {
      if (!data) return;
      onTokenSelect(data.tokenId || data.id);
    });

    bus.on('spell:cast', (data) => {
      if (!data) return;
      onSpell(data.tokenId || data.id);
    });
  }

  /**
   * Attach click-flash to all interactive elements matching a CSS selector.
   * Intended for toolbar buttons, tile palette, etc.
   * @param {string} [selector='.btn,.tile-btn,.tool-btn,.theme-btn']
   * @param {Element} [root=document]
   */
  function attachClickFeedback(selector, root) {
    selector = selector || '.btn,.tile-btn,.tool-btn,.theme-btn';
    root     = root     || document;
    root.querySelectorAll(selector).forEach(el => {
      if (el.dataset.fbAttached) return;
      el.addEventListener('pointerdown', () => _flashElement(el, 'click'), { passive: true });
      el.dataset.fbAttached = '1';
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  /**
   * Initialise FeedbackSystem.
   * @param {Object} [options]
   * @param {number} [options.tileSize=40]  - Map tile size in px.
   */
  function init(options) {
    _injectStyles();

    if (options) {
      if (options.tileSize) _tileSize = options.tileSize;
    }

    // Grab map elements (safe if not yet in DOM — will resolve on first use)
    _mapWrapper = document.getElementById('map-canvas-wrapper');
    _mapCanvas  = document.getElementById('map-canvas');

    // Attach click feedback to existing interactive elements
    attachClickFeedback();

    // Hook EventBus if available
    if (typeof EventBus !== 'undefined') {
      hookEventBus(EventBus);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    init,
    hookEventBus,
    attachClickFeedback,
    onClickFeedback,
    onTokenSelect,
    onDamage,
    onHeal,
    onDeath,
    onMove,
    onSpell,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeedbackSystem;
}
