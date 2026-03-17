/**
 * sceneManager.js – Scene Graph / Entity-Component System
 *
 * A lightweight ECS (Entity-Component-System) manager for managing game
 * entities, their components, and frame-level system updates. Entities
 * belong to layers for ordered rendering.
 *
 * Layers:
 *   background=0, tiles=1, props=2, tokens=3, fx=4, ui=5
 *
 * @module SceneManager
 */

const SceneManager = (() => {
  'use strict';

  /** Canonical layer ordering. */
  const LAYERS = Object.freeze({
    background: 0,
    tiles:      1,
    props:      2,
    tokens:     3,
    fx:         4,
    ui:         5,
  });

  /** Auto-incrementing entity ID counter. */
  let _nextId = 1;

  /**
   * Entity store.  entityId → { id, type, layer, components: { name: data } }
   * @type {Map<number, Object>}
   */
  const _entities = new Map();

  /**
   * Registered systems: name → updateFn(dt, entities).
   * @type {Map<string, Function>}
   */
  const _systems = new Map();

  // ── Entity management ───────────────────────────────────────────────────

  /**
   * Create a new entity.
   * @param {string} type - Semantic type (e.g. 'token', 'prop', 'tile').
   * @param {Object} [components={}] - Initial component data keyed by name.
   * @returns {Object} The created entity.
   */
  function createEntity(type, components) {
    const id = _nextId++;
    const layer = (components && components.render && components.render.layer !== undefined)
      ? components.render.layer
      : (LAYERS[type] !== undefined ? LAYERS[type] : LAYERS.tokens);

    const entity = {
      id,
      type: type || 'entity',
      layer,
      components: Object.assign({}, components || {}),
    };
    _entities.set(id, entity);
    return entity;
  }

  /**
   * Remove an entity by ID.
   * @param {number} id
   * @returns {boolean} True if the entity was found and removed.
   */
  function removeEntity(id) {
    return _entities.delete(id);
  }

  /**
   * Get an entity by ID.
   * @param {number} id
   * @returns {Object|undefined}
   */
  function getEntity(id) {
    return _entities.get(id);
  }

  /**
   * Get all entities matching a semantic type.
   * @param {string} type
   * @returns {Object[]}
   */
  function getEntitiesByType(type) {
    const result = [];
    for (const entity of _entities.values()) {
      if (entity.type === type) result.push(entity);
    }
    return result;
  }

  // ── Component helpers ───────────────────────────────────────────────────

  /**
   * Add (or overwrite) a component on an entity.
   * @param {number} entityId
   * @param {string} componentName
   * @param {*} data
   * @returns {boolean} True if the entity exists and the component was added.
   */
  function addComponent(entityId, componentName, data) {
    const entity = _entities.get(entityId);
    if (!entity) return false;
    entity.components[componentName] = data;
    return true;
  }

  /**
   * Remove a component from an entity.
   * @param {number} entityId
   * @param {string} componentName
   * @returns {boolean} True if the entity existed and the component was removed.
   */
  function removeComponent(entityId, componentName) {
    const entity = _entities.get(entityId);
    if (!entity || !(componentName in entity.components)) return false;
    delete entity.components[componentName];
    return true;
  }

  /**
   * Find all entities that have every listed component.
   * @param {...string} componentNames
   * @returns {Object[]}
   */
  function queryByComponent(...componentNames) {
    const result = [];
    for (const entity of _entities.values()) {
      let match = true;
      for (const name of componentNames) {
        if (!(name in entity.components)) {
          match = false;
          break;
        }
      }
      if (match) result.push(entity);
    }
    return result;
  }

  // ── Systems ─────────────────────────────────────────────────────────────

  /**
   * Register a system that runs once per frame during update().
   * @param {string} name - Unique system name.
   * @param {Function} updateFn - Called with (dt, entitiesMap).
   */
  function registerSystem(name, updateFn) {
    if (typeof updateFn !== 'function') return;
    _systems.set(name, updateFn);
  }

  /**
   * Unregister a system by name.
   * @param {string} name
   */
  function unregisterSystem(name) {
    _systems.delete(name);
  }

  /**
   * Run all registered systems. Typically called once per frame.
   * @param {number} dt - Delta time in seconds.
   */
  function update(dt) {
    for (const fn of _systems.values()) {
      fn(dt, _entities);
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  /**
   * Return all entities sorted by layer (ascending).
   * @returns {Object[]}
   */
  function getAllSorted() {
    return Array.from(_entities.values()).sort((a, b) => a.layer - b.layer);
  }

  /**
   * Remove all entities and systems.
   */
  function clear() {
    _entities.clear();
    _systems.clear();
    _nextId = 1;
  }

  /**
   * Total number of active entities.
   * @returns {number}
   */
  function count() {
    return _entities.size;
  }

  return {
    LAYERS,
    createEntity,
    removeEntity,
    getEntity,
    getEntitiesByType,
    addComponent,
    removeComponent,
    queryByComponent,
    registerSystem,
    unregisterSystem,
    update,
    getAllSorted,
    clear,
    count,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SceneManager;
}
