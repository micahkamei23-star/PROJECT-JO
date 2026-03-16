/**
 * animation.js – Character-Based Animation System
 * Ties visual animations to character actions (movement, attacks, spells).
 */

const AnimationSystem = (() => {
  const ACTIONS = {
    move:    { label: 'Move',       icon: '🏃', animClass: 'bounce', floatText: '👣 Move' },
    attack:  { label: 'Attack',     icon: '⚔️', animClass: 'shake',  floatText: '⚔️ Attack!' },
    spell:   { label: 'Cast Spell', icon: '✨', animClass: 'spin',   floatText: '✨ Spell!' },
    ability: { label: 'Ability',    icon: '💥', animClass: 'pulse',  floatText: '💥 Ability!' },
    defend:  { label: 'Defend',     icon: '🛡️', animClass: 'pulse',  floatText: '🛡️ Block!' },
    heal:    { label: 'Heal',       icon: '💚', animClass: 'pulse',  floatText: '💚 +Heal!' },
  };

  const ACTION_KEYS = Object.keys(ACTIONS);

  let stage       = null;
  let logEl       = null;
  let characters  = []; // { el, spriteEl, x, y, name, id }
  let logEntries  = [];

  /** Initialise with a stage DOM element and log list element. */
  function init(stageEl, logListEl) {
    stage = stageEl;
    logEl = logListEl;
  }

  /** Add a character token to the stage. */
  function addCharacter(id, name, avatar, x = 40, y = 40) {
    // Remove existing token if re-adding
    removeCharacter(id);

    const el       = document.createElement('div');
    el.className   = 'anim-character';
    el.id          = `anim-char-${id}`;
    el.style.left  = `${x}px`;
    el.style.bottom = `${y}px`;

    const spriteEl       = document.createElement('span');
    spriteEl.className   = 'char-sprite';
    spriteEl.textContent = avatar;

    const nameEl       = document.createElement('span');
    nameEl.className   = 'char-name-label';
    nameEl.textContent = name;

    el.appendChild(spriteEl);
    el.appendChild(nameEl);
    stage.appendChild(el);

    characters.push({ el, spriteEl, x, y, name, id });
    return el;
  }

  /** Remove a character from the stage. */
  function removeCharacter(id) {
    const idx = characters.findIndex(c => c.id === id);
    if (idx !== -1) {
      characters[idx].el.remove();
      characters.splice(idx, 1);
    }
  }

  /** Trigger an action animation on a character token. */
  function triggerAction(charId, actionKey) {
    const ch = characters.find(c => c.id === charId);
    if (!ch) return;

    const action = ACTIONS[actionKey];
    if (!action) return;

    // Remove previous animation classes
    ch.spriteEl.classList.remove(...Object.values(ACTIONS).map(a => a.animClass));

    // Force reflow so animation re-triggers even if same class
    void ch.spriteEl.offsetWidth;

    ch.spriteEl.classList.add(action.animClass);
    ch.spriteEl.addEventListener('animationend', () => {
      ch.spriteEl.classList.remove(action.animClass);
    }, { once: true });

    // Floating text
    _spawnFloat(ch.el, action.floatText);

    // Log
    _addLog(`${ch.name} used ${action.label}`);

    // Special movement: shift character position
    if (actionKey === 'move') {
      const stageW = stage.offsetWidth  || 600;
      const stageH = stage.offsetHeight || 320;
      const newX   = Math.max(20, Math.min(stageW - 70, ch.x + _rand(-60, 60)));
      const newY   = Math.max(20, Math.min(stageH - 70, ch.y + _rand(-40, 40)));
      ch.x = newX;
      ch.y = newY;
      ch.el.style.left   = `${ch.x}px`;
      ch.el.style.bottom = `${ch.y}px`;
    }
  }

  /** Move character to absolute position (px from left, px from bottom). */
  function moveCharacter(charId, x, y) {
    const ch = characters.find(c => c.id === charId);
    if (!ch) return;
    ch.x = x;
    ch.y = y;
    ch.el.style.left   = `${x}px`;
    ch.el.style.bottom = `${y}px`;
    _addLog(`${ch.name} moved to (${x}, ${y})`);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  function _spawnFloat(parentEl, text) {
    const rect   = parentEl.getBoundingClientRect();
    const sRect  = stage.getBoundingClientRect();
    const floatEl       = document.createElement('div');
    floatEl.className   = 'anim-float';
    floatEl.textContent = text;
    floatEl.style.left  = `${rect.left - sRect.left + 10}px`;
    floatEl.style.top   = `${rect.top  - sRect.top  - 10}px`;
    stage.appendChild(floatEl);
    floatEl.addEventListener('animationend', () => floatEl.remove(), { once: true });
  }

  function _addLog(message) {
    const ts = new Date().toLocaleTimeString();
    logEntries.unshift({ message, ts });
    if (logEntries.length > 50) logEntries.pop();
    _renderLog();
  }

  function _renderLog() {
    if (!logEl) return;
    logEl.innerHTML = logEntries
      .map(e => `<li><span>${e.ts}</span> — ${e.message}</li>`)
      .join('');
  }

  function _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  return {
    ACTIONS,
    ACTION_KEYS,
    init,
    addCharacter,
    removeCharacter,
    triggerAction,
    moveCharacter,
    get characters() { return characters; },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnimationSystem;
}
