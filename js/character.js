/**
 * character.js – Character Customization System
 * Manages character creation, attributes, abilities, and equipment.
 */

const CharacterSystem = (() => {
  const CLASSES = [
    'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter',
    'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer',
    'Warlock', 'Wizard',
  ];

  const RACES = [
    'Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome',
    'Half-Elf', 'Half-Orc', 'Tiefling', 'Dragonborn',
  ];

  const ALIGNMENTS = [
    'Lawful Good', 'Neutral Good', 'Chaotic Good',
    'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
    'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
  ];

  const ATTRIBUTES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  const CLASS_ABILITIES = {
    Fighter:   [
      { name: 'Second Wind',    icon: '💨', desc: 'Regain 1d10+level HP as a bonus action once per rest.' },
      { name: 'Action Surge',   icon: '⚡', desc: 'Take one additional action on your turn (1/rest).' },
      { name: 'Extra Attack',   icon: '⚔️', desc: 'Attack twice when you take the Attack action.' },
    ],
    Wizard:    [
      { name: 'Arcane Recovery', icon: '📚', desc: 'Recover spell slots equal to half your Wizard level once per rest.' },
      { name: 'Spellcasting',    icon: '✨', desc: 'Cast wizard spells using your spellbook.' },
      { name: 'Arcane Tradition',icon: '🌀', desc: 'Choose a school of magic specialization at level 2.' },
    ],
    Rogue:     [
      { name: 'Sneak Attack',   icon: '🗡️', desc: 'Deal extra 1d6 damage when you have advantage and use a finesse weapon.' },
      { name: 'Cunning Action', icon: '🏃', desc: 'Bonus action Dash, Disengage, or Hide.' },
      { name: 'Thieves\' Cant', icon: '🔒', desc: 'Secret language and set of signs known by rogues.' },
    ],
    Cleric:    [
      { name: 'Divine Domain', icon: '⛪', desc: 'Choose a domain at level 1 granting additional spells and features.' },
      { name: 'Turn Undead',   icon: '☀️', desc: 'Force undead creatures to flee as your action.' },
      { name: 'Spellcasting',  icon: '✨', desc: 'Cast cleric spells using Wisdom.' },
    ],
    Paladin:   [
      { name: 'Divine Smite',   icon: '⚡', desc: 'Expend a spell slot to deal 2d8 radiant damage per slot level on a hit.' },
      { name: 'Lay on Hands',   icon: '🤝', desc: 'Pool of healing equal to 5×your Paladin level per long rest.' },
      { name: 'Sacred Oath',    icon: '📜', desc: 'Choose an Oath at level 3 that grants expanded spells and abilities.' },
    ],
    Barbarian: [
      { name: 'Rage',       icon: '😡', desc: 'Bonus damage, resistance to bludgeoning/piercing/slashing; 2 uses at lvl 1.' },
      { name: 'Reckless Attack', icon: '⚔️', desc: 'Attack with advantage; enemies gain advantage on attacks against you.' },
      { name: 'Unarmored Defense', icon: '🛡️', desc: 'AC = 10 + DEX modifier + CON modifier when not wearing armor.' },
    ],
    Bard:      [
      { name: 'Bardic Inspiration', icon: '🎵', desc: 'Give a creature a d6 they can add to an ability check, attack, or save.' },
      { name: 'Spellcasting',       icon: '✨', desc: 'Cast bard spells using Charisma.' },
      { name: 'Jack of All Trades', icon: '🎭', desc: 'Add half proficiency bonus to non-proficient ability checks.' },
    ],
    Druid:     [
      { name: 'Wild Shape',   icon: '🐺', desc: 'Magically assume the shape of a beast you have seen.' },
      { name: 'Spellcasting', icon: '✨', desc: 'Cast druid spells using Wisdom.' },
      { name: 'Druidic',      icon: '🌿', desc: 'Secret language known only by druids.' },
    ],
    Monk:      [
      { name: 'Martial Arts', icon: '🥋', desc: 'Use DEX for unarmed strikes; deal 1d4 unarmed damage.' },
      { name: 'Ki',           icon: '💎', desc: 'Pool of ki points equal to Monk level for special techniques.' },
      { name: 'Unarmored Defense', icon: '🛡️', desc: 'AC = 10 + DEX modifier + WIS modifier when not wearing armor.' },
    ],
    Ranger:    [
      { name: 'Favored Enemy', icon: '🏹', desc: 'Advantage on Survival checks to track chosen enemy type.' },
      { name: 'Natural Explorer',icon: '🌲', desc: 'Expertise in a favored terrain; ignore difficult terrain.' },
      { name: 'Spellcasting',   icon: '✨', desc: 'Cast ranger spells using Wisdom.' },
    ],
    Sorcerer:  [
      { name: 'Sorcerous Origin', icon: '🌟', desc: 'Choose an innate magical origin at level 1.' },
      { name: 'Spellcasting',     icon: '✨', desc: 'Cast sorcerer spells using Charisma.' },
      { name: 'Sorcery Points',   icon: '💠', desc: 'Use to create spell slots or power Metamagic options.' },
    ],
    Warlock:   [
      { name: 'Otherworldly Patron', icon: '👁️', desc: 'Choose a patron at level 1 that grants expanded spell list.' },
      { name: 'Eldritch Invocations', icon: '🌀', desc: 'Choose two invocations at level 2 that augment your abilities.' },
      { name: 'Pact Magic',          icon: '✨', desc: 'Limited spell slots that recharge on short rest.' },
    ],
  };

  /** Generate a default attribute set (standard array). */
  function defaultAttributes() {
    return { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 };
  }

  /** Compute ability score modifier. */
  function modifier(score) {
    return Math.floor((score - 10) / 2);
  }

  /** Format modifier as "+N" or "-N". */
  function formatMod(score) {
    const m = modifier(score);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  /** Create a new character object. */
  function createCharacter(name, charClass, race, level = 1) {
    const maxHp = 10 + (level - 1) * 6;
    return {
      id:         Date.now(),
      name:       name || 'Unnamed Hero',
      charClass:  charClass || 'Fighter',
      race:       race || 'Human',
      level:      level,
      alignment:  'True Neutral',
      background: '',
      attributes: defaultAttributes(),
      maxHp,
      currentHp:  maxHp,
      abilities:  (CLASS_ABILITIES[charClass] || CLASS_ABILITIES['Fighter']).slice(),
      equipment:  [],
      avatar:     classAvatar(charClass),
    };
  }

  function classAvatar(cls) {
    const map = {
      Fighter: '⚔️', Wizard: '🧙', Rogue: '🗡️', Cleric: '⛪',
      Paladin: '🛡️', Barbarian: '😡', Bard: '🎵', Druid: '🌿',
      Monk: '🥋', Ranger: '🏹', Sorcerer: '🌟', Warlock: '👁️',
    };
    return map[cls] || '🧝';
  }

  return {
    CLASSES,
    RACES,
    ALIGNMENTS,
    ATTRIBUTES,
    CLASS_ABILITIES,
    defaultAttributes,
    modifier,
    formatMod,
    createCharacter,
    classAvatar,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CharacterSystem;
}
