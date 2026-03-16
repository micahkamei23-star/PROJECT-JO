/**
 * inventory.js – Inventory & Resource Tracking System
 * Tracks items, quantities, equipment, and consumables.
 */

const InventorySystem = (() => {
  const ITEM_TYPES = ['Weapon', 'Armor', 'Consumable', 'Tool', 'Treasure', 'Misc'];

  const STARTER_ITEMS = [
    { name: 'Health Potion',  type: 'Consumable', icon: '🧪', count: 3, maxCount: 10 },
    { name: 'Longsword',      type: 'Weapon',     icon: '⚔️', count: 1, maxCount: 1 },
    { name: 'Chain Mail',     type: 'Armor',      icon: '🛡️', count: 1, maxCount: 1 },
    { name: 'Torch',          type: 'Tool',       icon: '🔦', count: 5, maxCount: 20 },
    { name: 'Gold Coin',      type: 'Treasure',   icon: '🪙', count: 50, maxCount: 9999 },
    { name: 'Rations',        type: 'Consumable', icon: '🍖', count: 7, maxCount: 20 },
  ];

  /** Create a new inventory item. */
  function createItem(name, type, icon, count = 1, maxCount = 99) {
    return {
      id:       Date.now() + Math.random(),
      name:     name || 'Unknown Item',
      type:     type || 'Misc',
      icon:     icon || '📦',
      count:    Math.max(0, count),
      maxCount: maxCount,
    };
  }

  /** Use one unit of a consumable. Returns true if used successfully. */
  function useItem(item) {
    if (item.type !== 'Consumable') return false;
    if (item.count <= 0) return false;
    item.count -= 1;
    return true;
  }

  /** Add `amount` units to an item stack (capped at maxCount). */
  function addItem(item, amount = 1) {
    item.count = Math.min(item.count + amount, item.maxCount);
  }

  /** Remove `amount` units from an item stack. Returns actual removed. */
  function removeItem(item, amount = 1) {
    const actual = Math.min(amount, item.count);
    item.count -= actual;
    return actual;
  }

  /** Default starter inventory for a new character. */
  function starterInventory() {
    return STARTER_ITEMS.map(i => createItem(i.name, i.type, i.icon, i.count, i.maxCount));
  }

  return {
    ITEM_TYPES,
    STARTER_ITEMS,
    createItem,
    useItem,
    addItem,
    removeItem,
    starterInventory,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InventorySystem;
}
