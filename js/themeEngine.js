/**
 * themeEngine.js – UI Theme Management System
 * Manages visual themes for the PROJECT-JO D&D VTT interface.
 * Themes are applied via data-theme attribute on document.body,
 * paired with CSS custom-property definitions in the stylesheet.
 */

const ThemeEngine = (() => {
  'use strict';

  // ── Theme Definitions ──────────────────────────────────────────────────────

  const THEMES = [
    {
      id:          'dark-fantasy',
      name:        'Dark Fantasy',
      description: 'Classic dark brown and gold — the default dungeon atmosphere.',
      cssVars: {
        '--color-bg-primary':    '#1a1208',
        '--color-bg-secondary':  '#241a0e',
        '--color-bg-panel':      '#2e2010',
        '--color-bg-overlay':    'rgba(15,10,5,0.85)',
        '--color-border':        '#5a4020',
        '--color-border-accent': '#c8922a',
        '--color-text-primary':  '#e8d8b0',
        '--color-text-secondary':'#a89060',
        '--color-text-muted':    '#7a6040',
        '--color-accent':        '#c8922a',
        '--color-accent-hover':  '#e8b040',
        '--color-accent-dim':    '#7a5015',
        '--color-danger':        '#c03020',
        '--color-success':       '#408030',
        '--color-info':          '#3070a0',
        '--color-warning':       '#b08020',
        '--shadow-color':        'rgba(0,0,0,0.6)',
      },
    },
    {
      id:          'arcane-blue',
      name:        'Arcane Blue',
      description: 'Deep navy with cyan and blue magic accents.',
      cssVars: {
        '--color-bg-primary':    '#04080f',
        '--color-bg-secondary':  '#0a1020',
        '--color-bg-panel':      '#101828',
        '--color-bg-overlay':    'rgba(0,5,15,0.88)',
        '--color-border':        '#1a3050',
        '--color-border-accent': '#2890d0',
        '--color-text-primary':  '#c0e4f8',
        '--color-text-secondary':'#6090b8',
        '--color-text-muted':    '#385878',
        '--color-accent':        '#20aaee',
        '--color-accent-hover':  '#50d0ff',
        '--color-accent-dim':    '#0a4870',
        '--color-danger':        '#d03060',
        '--color-success':       '#20a070',
        '--color-info':          '#2070c0',
        '--color-warning':       '#a08030',
        '--shadow-color':        'rgba(0,10,30,0.7)',
      },
    },
    {
      id:          'infernal-red',
      name:        'Infernal Red',
      description: 'Dark and brooding with crimson fire accents.',
      cssVars: {
        '--color-bg-primary':    '#0d0404',
        '--color-bg-secondary':  '#180808',
        '--color-bg-panel':      '#200c0c',
        '--color-bg-overlay':    'rgba(10,2,2,0.88)',
        '--color-border':        '#3a1010',
        '--color-border-accent': '#b02020',
        '--color-text-primary':  '#f0d0c0',
        '--color-text-secondary':'#a06050',
        '--color-text-muted':    '#703830',
        '--color-accent':        '#d02020',
        '--color-accent-hover':  '#ff4030',
        '--color-accent-dim':    '#680808',
        '--color-danger':        '#ff2020',
        '--color-success':       '#508040',
        '--color-info':          '#405880',
        '--color-warning':       '#c08020',
        '--shadow-color':        'rgba(20,0,0,0.65)',
      },
    },
    {
      id:          'celestial-gold',
      name:        'Celestial Gold',
      description: 'Black and deep purple with bright gold and celestial white.',
      cssVars: {
        '--color-bg-primary':    '#080610',
        '--color-bg-secondary':  '#100d1e',
        '--color-bg-panel':      '#16122a',
        '--color-bg-overlay':    'rgba(4,3,10,0.90)',
        '--color-border':        '#2a2050',
        '--color-border-accent': '#d4a820',
        '--color-text-primary':  '#fff8e0',
        '--color-text-secondary':'#c8a840',
        '--color-text-muted':    '#7a6830',
        '--color-accent':        '#e8c030',
        '--color-accent-hover':  '#fff060',
        '--color-accent-dim':    '#6a5010',
        '--color-danger':        '#d04060',
        '--color-success':       '#40c080',
        '--color-info':          '#6080d0',
        '--color-warning':       '#e0a020',
        '--shadow-color':        'rgba(5,3,15,0.70)',
      },
    },
    {
      id:          'stone-steel',
      name:        'Stone & Steel',
      description: 'Grey stone textures with cool silver metal accents.',
      cssVars: {
        '--color-bg-primary':    '#0e0f10',
        '--color-bg-secondary':  '#181a1c',
        '--color-bg-panel':      '#222528',
        '--color-bg-overlay':    'rgba(8,9,10,0.87)',
        '--color-border':        '#383c40',
        '--color-border-accent': '#8090a0',
        '--color-text-primary':  '#d8dce0',
        '--color-text-secondary':'#8898a8',
        '--color-text-muted':    '#506070',
        '--color-accent':        '#9aaabb',
        '--color-accent-hover':  '#c0d0e0',
        '--color-accent-dim':    '#304050',
        '--color-danger':        '#c05040',
        '--color-success':       '#508060',
        '--color-info':          '#4878a8',
        '--color-warning':       '#a09030',
        '--shadow-color':        'rgba(0,0,0,0.65)',
      },
    },
    {
      id:          'parchment-classic',
      name:        'Parchment Classic',
      description: 'Light parchment and brown tones, like a medieval manuscript.',
      cssVars: {
        '--color-bg-primary':    '#f4ead0',
        '--color-bg-secondary':  '#ede0c0',
        '--color-bg-panel':      '#e8d8b0',
        '--color-bg-overlay':    'rgba(200,175,130,0.90)',
        '--color-border':        '#a08050',
        '--color-border-accent': '#5a3010',
        '--color-text-primary':  '#2a1808',
        '--color-text-secondary':'#5a3820',
        '--color-text-muted':    '#8a6848',
        '--color-accent':        '#7a3510',
        '--color-accent-hover':  '#a04818',
        '--color-accent-dim':    '#c09860',
        '--color-danger':        '#a02010',
        '--color-success':       '#3a7030',
        '--color-info':          '#2858a0',
        '--color-warning':       '#906010',
        '--shadow-color':        'rgba(60,30,0,0.25)',
      },
    },
  ];

  // ── Private State ──────────────────────────────────────────────────────────

  let _currentTheme   = 'dark-fantasy';
  let _changeCallbacks = [];
  const STORAGE_KEY   = 'project-jo-theme';

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _findTheme(id) {
    return THEMES.find(t => t.id === id) || null;
  }

  function _injectCssVars(theme) {
    const style = document.documentElement
      ? document.documentElement.style
      : null;
    if (!style) return;
    for (const [prop, value] of Object.entries(theme.cssVars)) {
      style.setProperty(prop, value);
    }
  }

  function _fireCallbacks(themeName) {
    for (const cb of _changeCallbacks) {
      try { cb(themeName); } catch (_) { /* swallow */ }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Apply a theme by id. Persists to localStorage.
   * @param {string} themeName
   */
  function applyTheme(themeName) {
    const theme = _findTheme(themeName);
    if (!theme) {
      console.warn(`[ThemeEngine] Unknown theme: "${themeName}"`);
      return;
    }

    _currentTheme = themeName;

    // Set data attribute for CSS selectors
    if (typeof document !== 'undefined' && document.body) {
      document.body.setAttribute('data-theme', themeName);
    }

    // Inject CSS custom properties
    _injectCssVars(theme);

    // Persist choice
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, themeName);
      }
    } catch (_) { /* storage unavailable */ }

    _fireCallbacks(themeName);
  }

  /** Get the current theme id. */
  function getTheme() {
    return _currentTheme;
  }

  /**
   * List all available themes.
   * @returns {{ id: string, name: string, description: string }[]}
   */
  function listThemes() {
    return THEMES.map(t => ({ id: t.id, name: t.name, description: t.description }));
  }

  /**
   * Initialise: load saved theme from localStorage, apply it,
   * and create a switcher UI if #theme-switcher exists in the DOM.
   */
  function init() {
    let saved = null;
    try {
      if (typeof localStorage !== 'undefined') {
        saved = localStorage.getItem(STORAGE_KEY);
      }
    } catch (_) { /* ignore */ }

    applyTheme(saved && _findTheme(saved) ? saved : 'dark-fantasy');

    if (typeof document !== 'undefined' && document.getElementById('theme-switcher')) {
      createThemeSwitcherUI('theme-switcher');
    }
  }

  /**
   * Create a theme switcher UI inside the given container element.
   * @param {string} containerId
   */
  function createThemeSwitcherUI(containerId) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    container.classList.add('theme-switcher');

    const label = document.createElement('span');
    label.className   = 'theme-switcher__label';
    label.textContent = 'Theme:';
    container.appendChild(label);

    for (const theme of THEMES) {
      const btn = document.createElement('button');
      btn.type          = 'button';
      btn.className     = 'theme-switcher__btn';
      btn.dataset.themeId = theme.id;
      btn.title         = theme.description;
      btn.textContent   = theme.name;

      if (theme.id === _currentTheme) {
        btn.classList.add('theme-switcher__btn--active');
      }

      btn.addEventListener('click', () => {
        applyTheme(theme.id);
        // Update active state on all buttons
        container.querySelectorAll('.theme-switcher__btn').forEach(b => {
          b.classList.toggle('theme-switcher__btn--active', b.dataset.themeId === theme.id);
        });
      });

      container.appendChild(btn);
    }
  }

  /**
   * Register a callback to be invoked when the theme changes.
   * @param {function(string): void} cb
   */
  function onThemeChange(cb) {
    if (typeof cb === 'function') _changeCallbacks.push(cb);
  }

  return {
    applyTheme,
    getTheme,
    listThemes,
    init,
    createThemeSwitcherUI,
    onThemeChange,
    THEMES,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ThemeEngine;
