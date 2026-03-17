/**
 * svgIcons.js – SVG Icon Set as Data URIs
 * 30+ fantasy/VTT icons organised by category for the PROJECT-JO D&D VTT.
 */

const SVGIcons = (() => {
  'use strict';

  // ── SVG Definitions ────────────────────────────────────────────────────────
  // Each value is a raw SVG string (24x24 viewBox, sharp fantasy style).

  const _svgs = {

    // ── Classes ──────────────────────────────────────────────────────────────
    classes: {
      warrior: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L14 6M10 4l4 2-2 4"/><rect x="2" y="18" width="6" height="4" rx="1"/><path d="M16 8l4-4M18 6l2-2"/></svg>`,
      mage:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z"/><line x1="12" y1="14" x2="12" y2="22"/></svg>`,
      rogue:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M15 4l3 1 1 3-7 7-4-4z"/><path d="M4 20l3-3 1 1-3 3z"/></svg>`,
      cleric:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><line x1="5" y1="10" x2="19" y2="10"/><circle cx="12" cy="10" r="2"/></svg>`,
      ranger:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L19 5"/><path d="M19 5l-3 8-4-4z"/><path d="M3 21l3-3"/></svg>`,
      paladin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6z"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
      bard:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="7" cy="17" rx="4" ry="3"/><line x1="11" y1="17" x2="11" y2="4"/><path d="M11 4c4 0 8 1 8 5s-4 5-8 5"/></svg>`,
      druid:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V12"/><path d="M12 12C12 12 6 10 6 5c0 0 3-1 6 3 3-4 6-3 6-3 0 5-6 7-6 7z"/></svg>`,
    },

    // ── Items ─────────────────────────────────────────────────────────────────
    items: {
      sword:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L17 5"/><path d="M17 5l1 3-3 1z"/><path d="M3 21l3-3 1 1-3 3z"/><line x1="7" y1="17" x2="9" y2="15"/></svg>`,
      shield:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6z"/></svg>`,
      staff:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><circle cx="12" cy="4" r="2"/><path d="M10 8h4"/></svg>`,
      potion:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v4l3 5c1 2 0 6-3 7H9c-3-1-4-5-3-7l3-5V3z"/><line x1="9" y1="3" x2="15" y2="3"/></svg>`,
      bow:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4c0 9 3 14 5 16"/><path d="M6 4c5 1 9 3 13 8"/><line x1="7" y1="17" x2="19" y2="7"/></svg>`,
      armor:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l4-2h8l4 2v5c0 7-4 11-8 13C8 20 4 16 4 9V4z"/><path d="M8 10h8M8 14h8"/></svg>`,
      scroll:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3c-2 0-2 3 0 3h12c2 0 2 3 0 3H6c-2 0-2 3 0 3h12"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
      gem:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l3 5-9 11L3 9z"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="4" x2="6" y2="9"/><line x1="15" y1="4" x2="18" y2="9"/></svg>`,
    },

    // ── Tools ─────────────────────────────────────────────────────────────────
    tools: {
      select:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 9-7 1-3 7z"/></svg>`,
      move:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18"/><path d="M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>`,
      draw:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17L7 7l4 8 3-5 3 5 3-8"/><line x1="3" y1="20" x2="21" y2="20"/></svg>`,
      erase:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5L9 16l-5 1 1-5L16 1z"/><line x1="3" y1="21" x2="21" y2="21"/></svg>`,
      measure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="3"/><line x1="3" y1="21" x2="7" y2="21"/><line x1="3" y1="21" x2="3" y2="17"/><line x1="21" y1="3" x2="17" y2="3"/><line x1="21" y1="3" x2="21" y2="7"/></svg>`,
      line:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="2" fill="currentColor"/><circle cx="20" cy="4" r="2" fill="currentColor"/></svg>`,
      circle:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/></svg>`,
    },

    // ── Actions ───────────────────────────────────────────────────────────────
    actions: {
      attack:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L17 5M17 5l-3 8-5-5z"/><path d="M3 21l3-3"/></svg>`,
      spell:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z"/></svg>`,
      item:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v4l3 5c1 2 0 6-3 7H9c-3-1-4-5-3-7l3-5V3z"/></svg>`,
      defend:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
      'end-turn':`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/><line x1="19" y1="6" x2="19" y2="18"/></svg>`,
    },

    // ── UI ────────────────────────────────────────────────────────────────────
    ui: {
      close:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`,
      minimize: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      expand:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V3h6M3 3l7 7M21 15v6h-6M21 21l-7-7"/></svg>`,
      settings: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
      save:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
      load:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
      search:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><line x1="15" y1="15" x2="21" y2="21"/></svg>`,
    },

    // ── Combat ────────────────────────────────────────────────────────────────
    combat: {
      initiative: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`,
      dice:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>`,
      hp:         `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21l-1-1C5 14 2 11 2 7.5A5.5 5.5 0 0112 4a5.5 5.5 0 0110 3.5c0 3.5-3 6.5-9 12.5z"/></svg>`,
      damage:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/><line x1="12" y1="8" x2="12" y2="16" stroke-width="2.5"/></svg>`,
      heal:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      status:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16" stroke-width="2.5"/></svg>`,
    },

    // ── Status Conditions ─────────────────────────────────────────────────────
    status: {
      poisoned:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v4l3 5c1 2 0 6-3 7H9c-3-1-4-5-3-7l3-5V3z"/><path d="M9 14c1 2 5 2 6 0"/></svg>`,
      burning:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c0 6-6 8-6 14a6 6 0 0012 0c0-6-6-8-6-14z"/><path d="M12 12c0 3-2 4-2 6a2 2 0 004 0c0-2-2-3-2-6z"/></svg>`,
      frozen:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M8 6l4-4 4 4M8 18l4 4 4-4"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M6 8l-4 4 4 4M18 8l4 4-4 4"/></svg>`,
      blessed:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>`,
      cursed:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L3 9l3 10h12l3-10z"/><path d="M9 13l2 2 4-4"/><line x1="12" y1="9" x2="12" y2="11"/></svg>`,
      invisible:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="3" stroke-dasharray="3 2"/><line x1="3" y1="3" x2="21" y2="21" stroke-width="1.5"/></svg>`,
    },
  };

  // ── Internals ──────────────────────────────────────────────────────────────

  function _encode(svgStr) {
    if (typeof btoa !== 'undefined') {
      return btoa(unescape(encodeURIComponent(svgStr)));
    }
    // Node.js fallback
    return Buffer.from(svgStr, 'utf8').toString('base64');
  }

  function _dataUri(svgStr) {
    return `data:image/svg+xml;base64,${_encode(svgStr)}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Get a data URI for the named icon.
   * @param {string} category
   * @param {string} name
   * @returns {string|null}
   */
  function get(category, name) {
    const cat = _svgs[category];
    if (!cat) return null;
    const raw = cat[name];
    if (!raw) return null;
    return _dataUri(raw);
  }

  /**
   * Get a CSS url() string ready for use in style declarations.
   * @param {string} category
   * @param {string} name
   * @returns {string|null}
   */
  function getUrl(category, name) {
    const uri = get(category, name);
    return uri ? `url("${uri}")` : null;
  }

  /**
   * List all icon names in a category.
   * @param {string} category
   * @returns {string[]}
   */
  function list(category) {
    return Object.keys(_svgs[category] || {});
  }

  /** List all category names. */
  function listCategories() {
    return Object.keys(_svgs);
  }

  /**
   * Inject CSS custom properties for all icons into a <style> tag.
   * Properties are named: --icon-{category}-{name}
   */
  function injectIconFont() {
    if (typeof document === 'undefined') return;

    const rules = [];
    for (const [cat, icons] of Object.entries(_svgs)) {
      for (const [name, raw] of Object.entries(icons)) {
        const propName = `--icon-${cat}-${name}`;
        rules.push(`  ${propName}: url("${_dataUri(raw)}");`);
      }
    }

    const id = 'project-jo-svg-icons';
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = `:root {\n${rules.join('\n')}\n}`;
  }

  return {
    get,
    getUrl,
    list,
    listCategories,
    injectIconFont,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SVGIcons;
