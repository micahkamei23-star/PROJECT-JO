/**
 * assetManager.js – Asset Manager
 *
 * A registry for game assets (textures, audio, maps, tokens, tilesets, fx).
 * Assets are registered by key, retrieved by key or type, and can be
 * serialised/deserialised for save/load. Provides placeholder support
 * for missing assets.
 *
 * @module AssetManager
 */

const AssetManager = (() => {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────

  /** Recognised asset types. */
  const ASSET_TYPES = Object.freeze([
    'texture', 'audio', 'map', 'token', 'tileset', 'fx',
  ]);

  // ── State ───────────────────────────────────────────────────────────────

  /**
   * Primary asset store. key → { key, type, data, meta }
   * @type {Map<string, {key: string, type: string, data: *, meta: Object}>}
   */
  const _assets = new Map();

  /**
   * Placeholder / default assets per type.
   * @type {Map<string, *>}
   */
  const _placeholders = new Map();

  // Initialise sensible default placeholders
  _placeholders.set('texture',  { src: '', width: 1, height: 1, placeholder: true });
  _placeholders.set('audio',    { src: '', duration: 0, placeholder: true });
  _placeholders.set('map',      { width: 20, height: 15, tiles: [], placeholder: true });
  _placeholders.set('token',    { name: 'Unknown', sprite: '', placeholder: true });
  _placeholders.set('tileset',  { tiles: [], placeholder: true });
  _placeholders.set('fx',       { frames: [], placeholder: true });

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Validate that a type string is recognised.
   * @param {string} type
   * @returns {boolean}
   */
  function _validType(type) {
    return ASSET_TYPES.indexOf(type) !== -1;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Register an asset.
   * @param {string} key   - Unique asset key.
   * @param {string} type  - One of ASSET_TYPES.
   * @param {*}      data  - Asset payload.
   * @param {Object} [meta={}] - Optional metadata.
   * @returns {boolean} True if registered successfully.
   */
  function register(key, type, data, meta) {
    if (!key || !_validType(type)) return false;
    _assets.set(key, { key, type, data, meta: meta || {} });
    return true;
  }

  /**
   * Retrieve an asset by key. Returns the placeholder for the asset's type
   * (or a generic object) if the key is not found.
   * @param {string} key
   * @returns {*}
   */
  function get(key) {
    const entry = _assets.get(key);
    if (entry) return entry.data;
    // Return a generic placeholder
    return { placeholder: true, key };
  }

  /**
   * Check if an asset is registered.
   * @param {string} key
   * @returns {boolean}
   */
  function has(key) {
    return _assets.has(key);
  }

  /**
   * Get all assets of a given type.
   * @param {string} type
   * @returns {Array<{key: string, type: string, data: *, meta: Object}>}
   */
  function getByType(type) {
    const result = [];
    for (const entry of _assets.values()) {
      if (entry.type === type) result.push(entry);
    }
    return result;
  }

  /**
   * Get the placeholder asset for a type.
   * @param {string} type
   * @returns {*}
   */
  function getPlaceholder(type) {
    return _placeholders.get(type) || { placeholder: true };
  }

  /**
   * Set or override the placeholder for a type.
   * @param {string} type
   * @param {*} data
   */
  function setPlaceholder(type, data) {
    _placeholders.set(type, data);
  }

  /**
   * Register a tile set asset.
   * @param {string} key
   * @param {Array} tiles - Array of tile definitions.
   * @returns {boolean}
   */
  function createTileSet(key, tiles) {
    return register(key, 'tileset', { tiles: tiles || [] });
  }

  /**
   * Register a token template asset.
   * @param {string} key
   * @param {Object} template - Token template data (name, sprite, stats, etc.).
   * @returns {boolean}
   */
  function createTokenTemplate(key, template) {
    return register(key, 'token', Object.assign({ name: key }, template || {}));
  }

  /**
   * Remove an asset by key.
   * @param {string} key
   * @returns {boolean}
   */
  function remove(key) {
    return _assets.delete(key);
  }

  /**
   * Serialise the entire asset registry to a plain object.
   * @returns {Object}
   */
  function serialize() {
    const out = [];
    for (const entry of _assets.values()) {
      out.push({
        key:  entry.key,
        type: entry.type,
        data: entry.data,
        meta: entry.meta,
      });
    }
    return { version: 1, assets: out };
  }

  /**
   * Restore the asset registry from a previously serialised snapshot.
   * @param {Object} payload
   */
  function deserialize(payload) {
    if (!payload || !Array.isArray(payload.assets)) return;
    _assets.clear();
    for (const entry of payload.assets) {
      if (entry.key && _validType(entry.type)) {
        _assets.set(entry.key, {
          key:  entry.key,
          type: entry.type,
          data: entry.data,
          meta: entry.meta || {},
        });
      }
    }
  }

  /**
   * Remove all registered assets.
   */
  function clear() {
    _assets.clear();
  }

  /**
   * Number of registered assets.
   * @returns {number}
   */
  function count() {
    return _assets.size;
  }

  return {
    ASSET_TYPES,
    register,
    get,
    has,
    getByType,
    getPlaceholder,
    setPlaceholder,
    createTileSet,
    createTokenTemplate,
    remove,
    serialize,
    deserialize,
    clear,
    count,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AssetManager;
}
