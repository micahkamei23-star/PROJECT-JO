/**
 * eventBus.js – Event Bus / Message System
 *
 * A lightweight publish-subscribe event system for decoupled communication
 * between game modules. Supports priority ordering, one-shot listeners,
 * and wildcard subscriptions that receive every emitted event.
 *
 * @module EventBus
 */

const EventBus = (() => {
  'use strict';

  /**
   * Map of event names to sorted listener arrays.
   * Each listener: { callback: Function, priority: number, once: boolean }
   * @type {Map<string, Array<{callback: Function, priority: number, once: boolean}>>}
   */
  const _listeners = new Map();

  /**
   * Insert a listener into the list for a given event, maintaining
   * descending priority order (higher priority = earlier execution).
   * @param {string} event
   * @param {Function} callback
   * @param {number} priority
   * @param {boolean} once
   */
  function _addListener(event, callback, priority, once) {
    if (typeof callback !== 'function') return;
    if (!_listeners.has(event)) {
      _listeners.set(event, []);
    }
    const list = _listeners.get(event);
    const entry = { callback, priority, once };

    // Binary-insert to maintain descending priority order
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].priority >= priority) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    list.splice(lo, 0, entry);
  }

  /**
   * Subscribe to an event. Use '*' to subscribe to all events.
   * @param {string} event - Event name or '*' for wildcard.
   * @param {Function} callback - Handler invoked when the event fires.
   * @param {number} [priority=0] - Higher values execute first.
   */
  function on(event, callback, priority) {
    _addListener(event, callback, priority || 0, false);
  }

  /**
   * Unsubscribe a specific callback from an event.
   * @param {string} event
   * @param {Function} callback
   */
  function off(event, callback) {
    if (!_listeners.has(event)) return;
    const list = _listeners.get(event);
    const idx = list.findIndex(l => l.callback === callback);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) _listeners.delete(event);
  }

  /**
   * Emit an event, calling all matching listeners and wildcard listeners.
   * Wildcard listeners receive the event name as the first argument.
   * @param {string} event
   * @param {...*} args
   */
  function emit(event, ...args) {
    // Collect listeners: event-specific + wildcard
    const specific = _listeners.has(event) ? _listeners.get(event).slice() : [];
    const wildcard = (event !== '*' && _listeners.has('*'))
      ? _listeners.get('*').slice()
      : [];

    // Merge both lists maintaining priority order
    const merged = [];
    let si = 0;
    let wi = 0;
    while (si < specific.length && wi < wildcard.length) {
      if (specific[si].priority >= wildcard[wi].priority) {
        merged.push({ entry: specific[si], isWild: false });
        si++;
      } else {
        merged.push({ entry: wildcard[wi], isWild: true });
        wi++;
      }
    }
    while (si < specific.length) {
      merged.push({ entry: specific[si], isWild: false });
      si++;
    }
    while (wi < wildcard.length) {
      merged.push({ entry: wildcard[wi], isWild: true });
      wi++;
    }

    for (const { entry, isWild } of merged) {
      if (entry.once) {
        const targetEvent = isWild ? '*' : event;
        off(targetEvent, entry.callback);
      }
      if (isWild) {
        entry.callback(event, ...args);
      } else {
        entry.callback(...args);
      }
    }
  }

  /**
   * Subscribe to an event for a single invocation, then auto-unsubscribe.
   * @param {string} event
   * @param {Function} callback
   */
  function once(event, callback) {
    _addListener(event, callback, 0, true);
  }

  /**
   * Clear listeners. If an event name is given, clear only that event.
   * If no argument is provided, clear all listeners.
   * @param {string} [event]
   */
  function clear(event) {
    if (event !== undefined) {
      _listeners.delete(event);
    } else {
      _listeners.clear();
    }
  }

  return {
    on,
    off,
    emit,
    once,
    clear,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EventBus;
}
