# PROJECT JO — Full Code Summary & Breakdown

**Project:** D&D 5e Virtual Tabletop (VTT) Engine  
**Type:** Browser-based web application  
**Tech Stack:** Vanilla JavaScript (ES6), HTML5 Canvas, CSS3  
**External Dependencies:** None — zero libraries, fully custom-built  
**Total Codebase:** ~5,900 lines of code (4,565 app code + 1,335 test code)

---

## What Is PROJECT JO?

PROJECT JO is a fully browser-based Dungeons & Dragons 5th Edition Virtual Tabletop application. It allows users to roll dice, create characters, manage inventories, build tactical maps, run combat encounters, and see visual effects — all from a single web page with no server or installation required.

---

## What Has Been Built (Feature Summary)

### 1. Dice Rolling System
- Roll any standard D&D die (d4, d6, d8, d10, d12, d20) or custom dice
- Support for multiple dice rolls with modifiers (e.g. 3d6+2)
- Full roll history with formatted labels
- Animated dice results in the UI

### 2. Character Creation & Management
- Create characters with name, class, race, alignment, and level (1–20)
- **12 character classes:** Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard
- **9 races:** Human, Elf, Dwarf, Halfling, Gnome, Half-Elf, Half-Orc, Tiefling, Dragonborn
- **9 alignments:** Lawful Good through Chaotic Evil
- Full D&D 5e ability scores (STR, DEX, CON, INT, WIS, CHA) with modifier calculations
- Each class has 3 unique abilities with icons and descriptions
- HP tracking with damage and healing, HP bar display
- Level-up system with HP scaling
- Emoji-based class avatars
- Party roster management (add, select, delete characters)

### 3. Inventory System
- Create items with name, type, icon, and quantity
- **6 item types:** Weapon, Armor, Consumable, Tool, Treasure, Misc
- Use consumable items (auto-decrements count)
- Stack items up to a max count
- Pre-built starter inventory kit (potions, longsword, chain mail, torch, gold, rations)
- Visual inventory grid display

### 4. Tactical Map Editor
- Canvas-based tile map with configurable grid size
- **10 tile types:** Floor, Stone, Wall, Water, Door, Trap, Grass, Lava, Stairs, Chest
- Each tile has gameplay properties (walkable, blocks vision, terrain type, sound profile)
- **Drawing tools:** Brush, Eraser, Flood Fill, Rectangle Fill
- **5 map layers:** Ground, Walls, Decals, Props, Effects
- Undo/Redo support (up to 50 steps)
- Zoom and pan with mouse wheel and drag
- Grid overlay toggle
- Animated tiles (water shimmer, lava glow)
- Custom tile shadows and borders

### 5. Token System (Characters on Map)
- Place character tokens on the map grid
- Drag-to-move with snap-to-grid
- Smooth animated movement (lerp transitions)
- Token HP bars displayed on map
- Status effect icons on tokens
- Vision radius and darkvision per token
- Aura rendering (radius and color)
- Faction assignment
- Token selection and action panel

### 6. Combat Tracker
- Initiative rolling (d20 per combatant, auto-sorted)
- Turn-based combat with round counter
- Action economy per turn: 1 action, 1 bonus action, 1 reaction, 30 ft movement
- Budget tracking — prevents overspending actions
- **15 D&D 5e conditions:** Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious, Exhaustion
- Condition add/remove/list per combatant

### 7. Visual Effects & Animations
- Character action animations: Move, Attack, Spell, Ability, Defend, Heal
- Floating damage/status text that fades out
- Animation log with timestamps
- **Particle effects engine** with 7 presets: Fire, Smoke, Sparks, Magic, Heal, Hit, Aura
- Particle system supports burst effects, timed effects, gravity, drag, color blending
- Object pooling for performance (up to 5,000 particles)
- Camera shake effect for impacts

### 8. Fog of War
- Full fog of war system with three states: Unseen (black), Explored (dimmed), Visible (lit)
- Shadow-casting line-of-sight algorithm (8-octant recursive)
- Per-token vision sources with configurable radius
- Darkvision support
- "Memory" — previously seen areas stay dimmed instead of going black
- Vision blocked by walls and other tiles marked as blocking
- Soft-edge fog rendering

### 9. Engine & Architecture Systems
- **Event Bus:** Publish-subscribe messaging system with priority ordering and wildcard support
- **Entity-Component System (ECS):** Flexible game object management with typed entities, components, and update systems
- **Game Loop:** RequestAnimationFrame-based loop with delta-time calculation at 60 FPS
- **Tweening Engine:** Animate any value over time with 6 easing functions (linear, easeInOut, easeOutCubic, easeInOutQuad, easeOutBack, easeOutElastic)
- **Timer System:** Delayed and repeating callbacks
- **Asset Manager:** Registry for textures, audio, maps, tokens, tilesets, and FX with serialization support
- **Render Pipeline:** Ordered multi-pass rendering (background → tiles → props → tokens → effects → fog → UI) with dirty-rect optimization, viewport culling, and performance stats

---

## UI & Design

### Layout
- Single-page application with **6 tabbed panels:**
  1. 🎲 **Dice** — Dice roller with history
  2. 🧝 **Characters** — Character creation and sheets
  3. 🎒 **Inventory** — Item management grid
  4. 🗺️ **Map Editor** — Full tactical map editor with sidebar tools
  5. ✨ **Animations** — Character animation stage
  6. ⚙️ **Engine** — Engine controls

### Theme
- **Dark fantasy aesthetic** — deep browns and blacks with gold accents
- Color palette: dark brown backgrounds, gold (#c8a84b) accents, cream text, muted brown secondary text
- Font: System fonts (Segoe UI, Tahoma, Verdana)
- All icons are emoji-based — no image assets needed
- Responsive grid layouts (2-column and 3-column grids)
- Styled buttons (gold primary, green success, red danger)
- HP bars with green fill
- Ability score stat grid
- Dice roll animation (scale + color pulse)
- Tab transitions and hover effects

---

## Code Architecture

```
PROJECT-JO/
├── index.html              — Main app page (6 tabbed panels, 517 lines)
├── css/styles.css          — Complete dark fantasy styling (1,029 lines)
├── js/
│   ├── main.js             — App initialization & UI wiring (889 lines)
│   ├── dice.js             — Dice rolling mechanics (43 lines)
│   ├── character.js        — Character creation & attributes (150 lines)
│   ├── inventory.js        — Item management (68 lines)
│   ├── animation.js        — Character animation effects (160 lines)
│   ├── combatSystem.js     — Combat tracker & turns (221 lines)
│   ├── map.js              — Map editor coordinator (630 lines)
│   ├── mapEngine.js        — Map state & tile system (458 lines)
│   ├── tileRenderer.js     — Canvas tile rendering (238 lines)
│   ├── tokenSystem.js      — Token placement & movement (399 lines)
│   ├── uiControls.js       — Map input handling (306 lines)
│   └── engine/
│       ├── eventBus.js     — Pub-sub event system (155 lines)
│       ├── sceneManager.js — Entity-Component System (223 lines)
│       ├── timeManager.js  — Game loop & tweening (293 lines)
│       ├── assetManager.js — Asset registry (224 lines)
│       ├── particleSystem.js — Particle effects (387 lines)
│       ├── fogOfWar.js     — Fog of war & line-of-sight (375 lines)
│       ├── actionSystem.js — Action economy (343 lines)
│       └── renderPipeline.js — Render pipeline (382 lines)
└── tests/
    ├── systems.test.js     — Core system tests (450 lines, 32 tests)
    └── engine.test.js      — Engine module tests (885 lines, 48 tests)
```

### How It Fits Together
1. **User interacts** with the UI (clicks, drags, types)
2. **Input handlers** (uiControls.js) capture events and route them
3. **Game systems** (dice, character, combat, inventory) process the logic
4. **Event Bus** broadcasts state changes to all listening systems
5. **Render Pipeline** draws everything to the HTML5 Canvas in ordered layers
6. **Visual output** updates on screen at 60 FPS

---

## Testing

- **80 unit tests** across 2 test files
- Tests cover all core systems: dice, character, inventory, map engine, combat
- Tests cover all engine modules: event bus, scene manager, time manager, asset manager, particles, fog of war, action system, render pipeline
- Run with: `node tests/systems.test.js` and `node tests/engine.test.js`
- Custom lightweight test harness (no external test framework)

---

## What's Not Yet Built (Future Opportunities)

- Multiplayer/networking (currently single-player only)
- Audio/sound effects (framework exists, no audio files)
- Save/load game state to browser storage
- Spell casting mechanics (class abilities are static descriptions)
- NPC artificial intelligence
- Procedural map generation
- Character sheet export/PDF
- Advanced pathfinding
- Mobile-optimized layout
- WebGL rendering (currently Canvas 2D)

---

## Key Technical Highlights

- **Zero external dependencies** — everything is custom-built vanilla JavaScript
- **No build tools required** — just open index.html in a browser
- **Modular IIFE architecture** — each file is a self-contained module
- **Canvas-based rendering** — high-performance tile and token drawing
- **Object pooling** — particle system reuses objects for performance
- **Shadow-casting algorithm** — real line-of-sight fog of war
- **Entity-Component System** — flexible, scalable game object management
- **Delta-time game loop** — smooth animations independent of frame rate
- **Comprehensive test coverage** — 80 tests validating all systems
