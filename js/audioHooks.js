/**
 * audioHooks.js – Audio Integration Stubs
 * Provides a structured audio API for PROJECT-JO that logs intent in debug mode
 * and hooks into the EventBus.  No actual audio files or Web Audio API usage —
 * the architecture is designed so a real implementation can drop straight in.
 */

const AudioHooks = (() => {
  'use strict';

  // ── Categories ─────────────────────────────────────────────────────────────

  const CATEGORIES = ['ambient', 'sfx', 'ui', 'music'];

  // ── Sound Registry ─────────────────────────────────────────────────────────

  // Pre-defined sound keys organised by category
  const SOUND_KEYS = {
    sfx: {
      dice_roll:      null, // url registered at runtime
      dice_crit:      null,
      dice_fail:      null,
      token_move:     null,
      spell_cast:     null,
      spell_impact:   null,
      sword_clash:    null,
      sword_draw:     null,
      arrow_release:  null,
      door_open:      null,
      door_creak:     null,
      chest_open:     null,
      combat_start:   null,
      combat_end:     null,
      heal:           null,
      damage_hit:     null,
      death:          null,
    },
    ui: {
      click:          null,
      hover:          null,
      tab_switch:     null,
      modal_open:     null,
      modal_close:    null,
      error:          null,
      success:        null,
      notification:   null,
    },
    ambient: {
      dungeon_drip:   null,
      tavern_crowd:   null,
      forest_wind:    null,
      cave_echo:      null,
      fire_crackle:   null,
      rain:           null,
      thunder:        null,
    },
    music: {
      victory_fanfare: null,
      battle_theme:    null,
      explore_theme:   null,
      tension_theme:   null,
      rest_theme:      null,
    },
  };

  // ── State ──────────────────────────────────────────────────────────────────

  let _debugLog = false;

  const _volumes = {
    ambient: 0.5,
    sfx:     0.8,
    ui:      0.6,
    music:   0.4,
  };

  const _muted = {
    ambient: false,
    sfx:     false,
    ui:      false,
    music:   false,
  };

  // Tracks currently "playing" sounds (stubs — no actual audio)
  const _playing = new Map(); // key: `${category}:${key}` → play opts

  // Event-bus handler unsubscribers
  let _eventUnsubs = [];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _log(msg) {
    if (_debugLog) console.log(`[AudioHooks] ${msg}`);
  }

  function _validCategory(cat) {
    return CATEGORIES.includes(cat);
  }

  function _effectiveVolume(category) {
    if (_muted[category]) return 0;
    return Math.max(0, Math.min(1, _volumes[category] ?? 1));
  }

  // ── Core API ───────────────────────────────────────────────────────────────

  /**
   * Play a sound.
   * @param {string} category  'ambient'|'sfx'|'ui'|'music'
   * @param {string} key       Sound key (see SOUND_KEYS)
   * @param {Object} [options] { loop, volume, fadeIn, delay }
   */
  function play(category, key, options = {}) {
    if (!_validCategory(category)) {
      _log(`play() — invalid category "${category}"`);
      return;
    }

    const vol = _effectiveVolume(category);
    const finalVol = options.volume !== undefined
      ? Math.min(options.volume, vol)
      : vol;

    const id = `${category}:${key}`;
    _playing.set(id, { category, key, options, volume: finalVol, startedAt: Date.now() });

    _log(`play "${category}/${key}" vol=${finalVol.toFixed(2)}${options.loop ? ' [loop]' : ''}${options.fadeIn ? ` [fadeIn=${options.fadeIn}s]` : ''}`);
  }

  /**
   * Stop a sound (or all sounds in a category if key is omitted).
   * @param {string} category
   * @param {string} [key]
   */
  function stop(category, key) {
    if (!_validCategory(category)) {
      _log(`stop() — invalid category "${category}"`);
      return;
    }

    if (key) {
      const id = `${category}:${key}`;
      _playing.delete(id);
      _log(`stop "${category}/${key}"`);
    } else {
      // Stop all in category
      for (const [id] of _playing) {
        if (id.startsWith(`${category}:`)) _playing.delete(id);
      }
      _log(`stop all in category "${category}"`);
    }
  }

  /**
   * Set the volume for a category (0–1).
   * @param {string} category
   * @param {number} level
   */
  function setVolume(category, level) {
    if (!_validCategory(category)) return;
    _volumes[category] = Math.max(0, Math.min(1, level));
    _log(`volume "${category}" = ${_volumes[category].toFixed(2)}`);
  }

  /**
   * Mute a category (or all if category is omitted).
   * @param {string} [category]
   */
  function mute(category) {
    if (category) {
      if (!_validCategory(category)) return;
      _muted[category] = true;
      _log(`muted "${category}"`);
    } else {
      CATEGORIES.forEach(c => { _muted[c] = true; });
      _log('muted all');
    }
  }

  /**
   * Unmute a category (or all if category is omitted).
   * @param {string} [category]
   */
  function unmute(category) {
    if (category) {
      if (!_validCategory(category)) return;
      _muted[category] = false;
      _log(`unmuted "${category}"`);
    } else {
      CATEGORIES.forEach(c => { _muted[c] = false; });
      _log('unmuted all');
    }
  }

  /**
   * Register a sound key with a URL (does not load/decode anything).
   * @param {string} key  e.g. 'sfx/dice_roll'
   * @param {string} url
   */
  function registerSound(key, url) {
    const parts    = key.split('/');
    const category = parts[0];
    const name     = parts.slice(1).join('/');

    if (!_validCategory(category)) {
      _log(`registerSound() — invalid category in key "${key}"`);
      return;
    }

    if (!SOUND_KEYS[category]) SOUND_KEYS[category] = {};
    SOUND_KEYS[category][name] = url;
    _log(`registered "${key}" → ${url}`);
  }

  /**
   * Get a list of registered sound keys for a category.
   * @param {string} category
   * @returns {string[]}
   */
  function listSounds(category) {
    if (!_validCategory(category)) return [];
    return Object.keys(SOUND_KEYS[category] || {});
  }

  /**
   * Get current volume for a category.
   * @param {string} category
   * @returns {number}
   */
  function getVolume(category) {
    return _volumes[category] ?? 1;
  }

  /**
   * Check if a category is muted.
   * @param {string} category
   * @returns {boolean}
   */
  function isMuted(category) {
    return !!_muted[category];
  }

  // ── EventBus Integration ───────────────────────────────────────────────────

  // Maps EventBus event names to sound triggers
  const EVENT_SOUND_MAP = {
    'combat:start':       () => play('sfx',   'combat_start'),
    'combat:end':         () => play('sfx',   'combat_end'),
    'combat:nextTurn':    () => play('ui',    'tab_switch'),
    'token:move':         () => play('sfx',   'token_move'),
    'dice:roll':          () => play('sfx',   'dice_roll'),
    'dice:crit':          () => play('sfx',   'dice_crit'),
    'dice:fail':          () => play('sfx',   'dice_fail'),
    'spell:cast':         () => play('sfx',   'spell_cast'),
    'spell:impact':       () => play('sfx',   'spell_impact'),
    'combat:hit':         () => play('sfx',   'damage_hit'),
    'combat:heal':        () => play('sfx',   'heal'),
    'combat:death':       () => play('sfx',   'death'),
    'ui:click':           () => play('ui',    'click'),
    'ui:hover':           () => play('ui',    'hover'),
    'ui:modalOpen':       () => play('ui',    'modal_open'),
    'ui:modalClose':      () => play('ui',    'modal_close'),
    'map:doorOpen':       () => play('sfx',   'door_open'),
    'map:chestOpen':      () => play('sfx',   'chest_open'),
    'scene:victory':      () => play('music', 'victory_fanfare', { loop: false }),
    'scene:combatMusic':  () => { stop('music'); play('music', 'battle_theme', { loop: true }); },
    'scene:exploreMusic': () => { stop('music'); play('music', 'explore_theme', { loop: true }); },
  };

  /**
   * Hook into a PROJECT-JO EventBus instance.
   * Subscribes to game events and triggers sounds accordingly.
   * @param {Object} eventBusInstance  An EventBus with .on(event, cb) support
   */
  function onEvent(eventBusInstance) {
    if (!eventBusInstance || typeof eventBusInstance.on !== 'function') {
      _log('onEvent() — invalid EventBus instance provided');
      return;
    }

    // Unsubscribe any previous hooks
    offEvent();

    for (const [eventName, handler] of Object.entries(EVENT_SOUND_MAP)) {
      const unsub = eventBusInstance.on(eventName, handler);
      if (typeof unsub === 'function') _eventUnsubs.push(unsub);
    }

    _log(`hooked into EventBus — listening to ${Object.keys(EVENT_SOUND_MAP).length} events`);
  }

  /** Remove all EventBus subscriptions. */
  function offEvent() {
    for (const unsub of _eventUnsubs) {
      try { unsub(); } catch (_) { /* ignore */ }
    }
    _eventUnsubs = [];
  }

  // ── Debug ──────────────────────────────────────────────────────────────────

  /**
   * Enable or disable debug logging.
   * When enabled, every play/stop/volume call is logged to the console.
   * @param {boolean} bool
   */
  function enableDebugLog(bool) {
    _debugLog = !!bool;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // Core playback
    play,
    stop,
    setVolume,
    getVolume,
    mute,
    unmute,
    isMuted,

    // Registry
    registerSound,
    listSounds,

    // EventBus integration
    onEvent,
    offEvent,

    // Debug
    enableDebugLog,

    // Constants (read-only reference)
    CATEGORIES,
    SOUND_KEYS,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AudioHooks;
