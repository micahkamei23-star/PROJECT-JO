/**
 * dice.js – Dice Rolling Mechanics
 * Supports d4, d6, d8, d10, d12, d20 with modifiers.
 */

const Dice = (() => {
  /** Roll a single die with `sides` faces. Returns 1–sides. */
  function rollDie(sides) {
    if (!Number.isInteger(sides) || sides < 2) {
      throw new RangeError(`Invalid die sides: ${sides}`);
    }
    return Math.floor(Math.random() * sides) + 1;
  }

  /**
   * Roll `count` dice with `sides` faces and apply `modifier`.
   * Returns { rolls, total, sides, modifier, label }.
   */
  function roll(sides, count = 1, modifier = 0) {
    const rolls = Array.from({ length: count }, () => rollDie(sides));
    const sum   = rolls.reduce((a, b) => a + b, 0);
    const total = sum + modifier;
    const label = buildLabel(count, sides, modifier);
    return { rolls, total, sides, count, modifier, label };
  }

  function buildLabel(count, sides, modifier) {
    let str = `${count}d${sides}`;
    if (modifier > 0) str += `+${modifier}`;
    if (modifier < 0) str += `${modifier}`;
    return str;
  }

  /** Standard dice types available in D&D 5e */
  const DICE_TYPES = [4, 6, 8, 10, 12, 20];

  return { rollDie, roll, DICE_TYPES };
})();

// Export for use in other modules (works in both browser globals and tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dice;
}
