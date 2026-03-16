/**
 * main.js – Application initialization and UI wiring.
 * Connects all subsystems: Character, Map, Dice, Inventory, Animation.
 */

(function () {
  'use strict';

  // ── App State ──────────────────────────────────────────────────────────────
  const state = {
    characters:      [],
    selectedCharId:  null,
    rollHistory:     [],
    inventory:       [],
    mapData:         null,
  };

  // ── DOM helpers ────────────────────────────────────────────────────────────
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // ── Tab navigation ─────────────────────────────────────────────────────────
  function initTabs() {
    $$('nav button[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('nav button[data-tab]').forEach(b => b.classList.remove('active'));
        $$('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = $(`#tab-${btn.dataset.tab}`);
        if (panel) panel.classList.add('active');
      });
    });
    // Activate first tab
    const first = $('nav button[data-tab]');
    if (first) first.click();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DICE PANEL
  // ══════════════════════════════════════════════════════════════════════════
  function initDicePanel() {
    const resultValue = $('#dice-result-value');
    const resultLabel = $('#dice-result-label');
    const historyList = $('#dice-history');
    const modInput    = $('#dice-modifier');
    const countInput  = $('#dice-count');

    function performRoll(sides) {
      const modifier = parseInt(modInput.value, 10) || 0;
      const count    = Math.max(1, parseInt(countInput.value, 10) || 1);
      const result   = Dice.roll(sides, count, modifier);

      // Update result display
      resultValue.textContent = result.total;
      resultLabel.textContent = `${result.label}  [${result.rolls.join(', ')}]`;

      // Animate result
      resultValue.animate(
        [{ transform: 'scale(1.4)', color: '#fff' }, { transform: 'scale(1)', color: '#c8a84b' }],
        { duration: 350, easing: 'ease-out' }
      );

      // Add to history
      state.rollHistory.unshift({
        label: result.label,
        rolls: result.rolls,
        total: result.total,
        ts:    new Date().toLocaleTimeString(),
      });
      if (state.rollHistory.length > 30) state.rollHistory.pop();
      renderRollHistory(historyList);
    }

    // Render die buttons
    const diceContainer = $('#dice-buttons');
    Dice.DICE_TYPES.forEach(sides => {
      const btn = document.createElement('button');
      btn.className = 'die-btn';
      btn.innerHTML = `<span class="die-icon">🎲</span><span class="die-label">d${sides}</span>`;
      btn.setAttribute('data-tooltip', `Roll d${sides}`);
      btn.addEventListener('click', () => performRoll(sides));
      diceContainer.appendChild(btn);
    });

    // Custom roll button
    $('#btn-custom-roll').addEventListener('click', () => {
      const sides = parseInt($('#dice-custom-sides').value, 10);
      if (!Number.isFinite(sides) || sides < 2) {
        alert('Please enter a valid number of sides (minimum 2).');
        return;
      }
      performRoll(sides);
    });

    // Clear history
    $('#btn-clear-history').addEventListener('click', () => {
      state.rollHistory = [];
      renderRollHistory(historyList);
      resultValue.textContent = '—';
      resultLabel.textContent = 'Click a die to roll';
    });
  }

  function renderRollHistory(listEl) {
    listEl.innerHTML = state.rollHistory
      .map(r => `<li>
        <span>${r.ts} – ${r.label} [${r.rolls.join(', ')}]</span>
        <span class="rh-val">${r.total}</span>
      </li>`)
      .join('') || '<li class="text-muted">No rolls yet.</li>';
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CHARACTER PANEL
  // ══════════════════════════════════════════════════════════════════════════
  function initCharacterPanel() {
    // Populate class & race selects
    const classSelect = $('#char-class-select');
    CharacterSystem.CLASSES.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = cls;
      classSelect.appendChild(opt);
    });

    const raceSelect = $('#char-race-select');
    CharacterSystem.RACES.forEach(race => {
      const opt = document.createElement('option');
      opt.value = race;
      opt.textContent = race;
      raceSelect.appendChild(opt);
    });

    const alignSelect = $('#char-alignment-select');
    CharacterSystem.ALIGNMENTS.forEach(al => {
      const opt = document.createElement('option');
      opt.value = al;
      opt.textContent = al;
      alignSelect.appendChild(opt);
    });

    // Create character
    $('#btn-create-char').addEventListener('click', () => {
      const name   = $('#char-name-input').value.trim() || 'Unnamed Hero';
      const cls    = classSelect.value;
      const race   = raceSelect.value;
      const level  = parseInt($('#char-level-input').value, 10) || 1;
      const char   = CharacterSystem.createCharacter(name, cls, race, level);
      char.alignment = alignSelect.value;
      char.inventory = InventorySystem.starterInventory();
      state.characters.push(char);
      selectCharacter(char.id);
      renderCharacterList();
    });

    // HP controls
    $('#btn-heal').addEventListener('click', () => {
      const char = getSelectedChar();
      if (!char) return;
      const amt = parseInt($('#hp-adjust-input').value, 10) || 1;
      char.currentHp = Math.min(char.maxHp, char.currentHp + amt);
      renderCharacterSheet(char);
    });

    $('#btn-damage').addEventListener('click', () => {
      const char = getSelectedChar();
      if (!char) return;
      const amt = parseInt($('#hp-adjust-input').value, 10) || 1;
      char.currentHp = Math.max(0, char.currentHp - amt);
      renderCharacterSheet(char);
    });

    // Level up
    $('#btn-level-up').addEventListener('click', () => {
      const char = getSelectedChar();
      if (!char) return;
      char.level  = Math.min(20, char.level + 1);
      char.maxHp += 6;
      char.currentHp = Math.min(char.currentHp + 6, char.maxHp);
      renderCharacterSheet(char);
    });

    // Delete character
    $('#btn-delete-char').addEventListener('click', () => {
      if (!state.selectedCharId) return;
      if (!confirm('Delete this character?')) return;
      state.characters = state.characters.filter(c => c.id !== state.selectedCharId);
      state.selectedCharId = null;
      renderCharacterList();
      clearCharacterSheet();
    });

    renderCharacterList();
  }

  function getSelectedChar() {
    return state.characters.find(c => c.id === state.selectedCharId) || null;
  }

  function selectCharacter(id) {
    state.selectedCharId = id;
    renderCharacterList();
    const char = getSelectedChar();
    if (char) {
      renderCharacterSheet(char);
      // Sync inventory tab
      state.inventory = char.inventory || [];
      renderInventory();
    }
  }

  function renderCharacterList() {
    const listEl = $('#char-list');
    if (state.characters.length === 0) {
      listEl.innerHTML = '<p class="text-muted">No characters yet. Create one above.</p>';
      return;
    }
    listEl.innerHTML = state.characters.map(c => `
      <div class="char-list-item ${c.id === state.selectedCharId ? 'selected' : ''}"
           data-id="${c.id}">
        <span class="char-avatar">${c.avatar}</span>
        <div class="char-info">
          <div class="cname">${escHtml(c.name)}</div>
          <div class="cclass">${c.race} ${c.charClass} — Level ${c.level}</div>
        </div>
        <span class="badge badge-gold">HP ${c.currentHp}/${c.maxHp}</span>
      </div>
    `).join('');

    $$('#char-list .char-list-item').forEach(el => {
      el.addEventListener('click', () => selectCharacter(Number(el.dataset.id)));
    });
  }

  function renderCharacterSheet(char) {
    // Header info
    $('#sheet-name').textContent  = char.name;
    $('#sheet-class').textContent = `${char.race} ${char.charClass} — Level ${char.level} — ${char.alignment}`;
    $('#sheet-avatar').textContent = char.avatar;

    // HP bar
    const pct = char.maxHp > 0 ? (char.currentHp / char.maxHp) * 100 : 0;
    const fillEl = $('#hp-bar-fill');
    fillEl.style.width = `${pct}%`;
    fillEl.className = 'hp-bar-fill' + (pct <= 25 ? ' critical' : pct <= 50 ? ' low' : '');
    $('#hp-display').textContent = `${char.currentHp} / ${char.maxHp} HP`;

    // Attributes
    const attrGrid = $('#attr-grid');
    attrGrid.innerHTML = CharacterSystem.ATTRIBUTES.map(attr => {
      const score = char.attributes[attr];
      const mod   = CharacterSystem.formatMod(score);
      return `
        <div class="stat-box" data-attr="${attr}" data-charid="${char.id}">
          <div class="stat-name">${attr}</div>
          <input type="number" min="1" max="30" value="${score}"
                 class="attr-input" data-attr="${attr}" data-charid="${char.id}">
          <div class="stat-mod">${mod}</div>
        </div>
      `;
    }).join('');

    // Live attribute editing
    $$('#attr-grid .attr-input').forEach(input => {
      input.addEventListener('change', () => {
        const c = state.characters.find(x => x.id === Number(input.dataset.charid));
        if (!c) return;
        const val = Math.max(1, Math.min(30, parseInt(input.value, 10) || 10));
        c.attributes[input.dataset.attr] = val;
        // Update modifier display
        input.nextElementSibling.textContent = CharacterSystem.formatMod(val);
      });
    });

    // Abilities
    const abilityList = $('#ability-list');
    abilityList.innerHTML = char.abilities.map(ab => `
      <div class="ability-item">
        <span class="ability-icon">${ab.icon}</span>
        <div class="ability-body">
          <div class="ability-name">${escHtml(ab.name)}</div>
          <div class="ability-desc">${escHtml(ab.desc)}</div>
        </div>
      </div>
    `).join('') || '<p class="text-muted">No abilities.</p>';
  }

  function clearCharacterSheet() {
    $('#sheet-name').textContent   = 'Select a character';
    $('#sheet-class').textContent  = '';
    $('#sheet-avatar').textContent = '🧝';
    $('#hp-display').textContent   = '— / — HP';
    $('#hp-bar-fill').style.width  = '0%';
    $('#attr-grid').innerHTML      = '';
    $('#ability-list').innerHTML   = '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  INVENTORY PANEL
  // ══════════════════════════════════════════════════════════════════════════
  function initInventoryPanel() {
    // Populate item type select
    const typeSelect = $('#inv-item-type');
    InventorySystem.ITEM_TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSelect.appendChild(opt);
    });

    // Add item
    $('#btn-add-item').addEventListener('click', () => {
      const name  = $('#inv-item-name').value.trim();
      const type  = typeSelect.value;
      const icon  = $('#inv-item-icon').value.trim() || '📦';
      const count = parseInt($('#inv-item-count').value, 10) || 1;
      if (!name) { alert('Please enter an item name.'); return; }

      const item = InventorySystem.createItem(name, type, icon, count);
      state.inventory.push(item);

      // Sync to selected character
      const char = getSelectedChar();
      if (char) char.inventory = state.inventory;

      renderInventory();

      // Clear inputs
      $('#inv-item-name').value  = '';
      $('#inv-item-icon').value  = '';
      $('#inv-item-count').value = '1';
    });

    // Load starter kit
    $('#btn-starter-kit').addEventListener('click', () => {
      state.inventory = InventorySystem.starterInventory();
      const char = getSelectedChar();
      if (char) char.inventory = state.inventory;
      renderInventory();
    });

    renderInventory();
  }

  function renderInventory() {
    const grid = $('#inventory-grid');
    if (state.inventory.length === 0) {
      grid.innerHTML = '<p class="text-muted">No items. Add some above.</p>';
      return;
    }
    grid.innerHTML = state.inventory.map(item => `
      <div class="inv-item" data-item-id="${item.id}">
        <span style="font-size:1.6rem">${item.icon}</span>
        <div class="item-name">${escHtml(item.name)}</div>
        <div class="item-type">${item.type}</div>
        <div class="item-count">✕ ${item.count} / ${item.maxCount}</div>
        <div class="item-actions">
          ${item.type === 'Consumable'
            ? `<button class="btn btn-success btn-sm" onclick="useItem(${item.id})">Use</button>`
            : ''}
          <button class="btn btn-secondary btn-sm" onclick="addOneItem(${item.id})">+1</button>
          <button class="btn btn-danger btn-sm"    onclick="removeOneItem(${item.id})">−1</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteItem(${item.id})">🗑</button>
        </div>
      </div>
    `).join('');
  }

  // Expose item action helpers to global scope (called from inline onclick)
  window.useItem = function (id) {
    const item = state.inventory.find(i => i.id === id);
    if (!item) return;
    const used = InventorySystem.useItem(item);
    if (!used) { alert(`Cannot use "${item.name}". It is not a consumable or is empty.`); return; }
    if (item.count === 0) {
      state.inventory = state.inventory.filter(i => i.id !== id);
    }
    const char = getSelectedChar();
    if (char) char.inventory = state.inventory;
    renderInventory();
  };

  window.addOneItem = function (id) {
    const item = state.inventory.find(i => i.id === id);
    if (item) { InventorySystem.addItem(item, 1); renderInventory(); }
  };

  window.removeOneItem = function (id) {
    const item = state.inventory.find(i => i.id === id);
    if (item) {
      InventorySystem.removeItem(item, 1);
      if (item.count === 0 && item.type === 'Consumable') {
        state.inventory = state.inventory.filter(i => i.id !== id);
      }
      renderInventory();
    }
  };

  window.deleteItem = function (id) {
    state.inventory = state.inventory.filter(i => i.id !== id);
    const char = getSelectedChar();
    if (char) char.inventory = state.inventory;
    renderInventory();
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  MAP EDITOR PANEL
  // ══════════════════════════════════════════════════════════════════════════
  function initMapPanel() {
    const canvasEl = $('#map-canvas');
    MapEditor.init(canvasEl, 20, 15);

    // ── Action log ───────────────────────────────────────────────────────────
    const logEl = $('#map-action-log');
    const MAX_LOG_ENTRIES = 50;
    function appendLog(message) {
      const li = document.createElement('li');
      li.textContent = message;
      if (logEl.querySelector('.text-muted')) logEl.innerHTML = '';
      logEl.prepend(li);
      while (logEl.children.length > MAX_LOG_ENTRIES) logEl.removeChild(logEl.lastChild);
    }
    MapEditor.onLog(appendLog);

    // ── Tool palette ─────────────────────────────────────────────────────────
    const toolPalette = $('#tool-palette');
    Object.entries(UIControls.TOOLS).forEach(([key, tool]) => {
      const btn = document.createElement('button');
      btn.className = `tile-btn${key === MapEditor.activeTool ? ' active' : ''}`;
      btn.textContent = tool.icon;
      btn.setAttribute('data-tooltip', tool.label);
      btn.dataset.tool = key;
      btn.addEventListener('click', () => {
        MapEditor.setTool(key);
        $$('#tool-palette .tile-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      toolPalette.appendChild(btn);
    });

    $('#btn-toggle-grid').addEventListener('click', () => {
      MapEditor.toggleGrid();
      $('#btn-toggle-grid').classList.toggle('active', MapEditor.showGrid);
    });

    $('#btn-reset-view').addEventListener('click', () => MapEditor.resetView());

    $('#btn-toggle-fog').addEventListener('click', () => {
      const enabled = MapEditor.toggleFog();
      $('#btn-toggle-fog').classList.toggle('active', enabled);
      appendLog(enabled ? '🌫 Fog of war enabled.' : '☀️ Fog of war disabled.');
    });

    $('#btn-reset-fog').addEventListener('click', () => {
      MapEditor.resetFog();
      appendLog('🌑 Fog reset – all tiles hidden again.');
    });

    // ── Tile palette ──────────────────────────────────────────────────────────
    const tilePalette = $('#tile-palette');
    [...MapEditor.TILE_KEYS, 'empty'].forEach(key => {
      const tile = MapEditor.TILES[key] || { icon: '❌', label: 'Erase' };
      const btn  = document.createElement('button');
      btn.className = `tile-btn ${key === MapEditor.selectedTile ? 'active' : ''}`;
      btn.textContent = tile.icon;
      btn.setAttribute('data-tooltip', tile.label || key);
      btn.dataset.tile = key;
      btn.addEventListener('click', () => {
        MapEditor.selectedTile = key;
        // Switch to brush when a tile is selected (unless erase)
        if (key === 'empty') {
          MapEditor.setTool('eraser');
          $$('#tool-palette .tile-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.tool === 'eraser'));
        } else {
          const wasEraser = MapEditor.activeTool === 'eraser';
          if (wasEraser) {
            MapEditor.setTool('brush');
            $$('#tool-palette .tile-btn').forEach(b =>
              b.classList.toggle('active', b.dataset.tool === 'brush'));
          }
        }
        $$('#tile-palette .tile-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      tilePalette.appendChild(btn);
    });

    // ── Token management ──────────────────────────────────────────────────────
    const tokenCharSel  = $('#map-token-char-select');
    const tokenListEl   = $('#map-token-list');

    function refreshTokenCharSelect() {
      tokenCharSel.innerHTML = state.characters.length === 0
        ? '<option value="">— No characters —</option>'
        : ['<option value="">— Select character —</option>',
           ...state.characters.map(c =>
             `<option value="${c.id}">${escHtml(c.name)}</option>`)
          ].join('');
    }

    function refreshTokenList() {
      const tokens = MapEditor.getTokens();
      if (tokens.length === 0) {
        tokenListEl.innerHTML = '<p class="text-muted">No tokens on map.</p>';
        return;
      }
      tokenListEl.innerHTML = tokens.map(t =>
        `<div class="token-list-item${t.id === MapEditor.tokenSystem.selectedId ? ' selected' : ''}"
              data-id="${t.id}">
           <span class="token-avatar">${t.avatar}</span>
           <span class="token-name">${escHtml(t.name)}</span>
           <span class="token-hp">${t.hp}/${t.maxHp}</span>
         </div>`
      ).join('');
      tokenListEl.querySelectorAll('.token-list-item').forEach(item => {
        item.addEventListener('click', () => {
          MapEditor.tokenSystem.selectToken(Number(item.dataset.id));
        });
      });
    }

    $('#btn-add-map-token').addEventListener('click', () => {
      refreshTokenCharSelect();
      const charId = Number(tokenCharSel.value);
      const char   = state.characters.find(c => c.id === charId);
      if (!char) { alert('Select a character first.'); return; }
      const col = parseInt($('#map-token-col').value, 10) || 0;
      const row = parseInt($('#map-token-row').value, 10) || 0;
      MapEditor.addToken(char.id, char.name, char.avatar, char.currentHp, char.maxHp, col, row);
      appendLog(`🧙 ${char.name} placed on the map at (${col}, ${row}).`);
      refreshTokenList();
    });

    $('#btn-remove-map-token').addEventListener('click', () => {
      const charId = Number(tokenCharSel.value);
      const char   = state.characters.find(c => c.id === charId);
      if (!char) { alert('Select a character first.'); return; }
      MapEditor.removeTokenByCharId(char.id);
      appendLog(`🗑 ${char.name} removed from the map.`);
      refreshTokenList();
      updateSelectedTokenPanel(null);
    });

    // ── Selected token panel ──────────────────────────────────────────────────
    const selPanel  = $('#selected-token-panel');
    const selAvatar = $('#sel-token-avatar');
    const selName   = $('#sel-token-name');
    const selHp     = $('#sel-token-hp');

    function updateSelectedTokenPanel(tokenId) {
      const token = tokenId ? MapEditor.tokenSystem.getToken(tokenId) : null;
      if (!token) {
        selPanel.style.display = 'none';
        return;
      }
      selPanel.style.display = '';
      selAvatar.textContent  = token.avatar;
      selName.textContent    = token.name;
      selHp.textContent      = `HP: ${token.hp} / ${token.maxHp}`;
      refreshTokenList();
    }

    MapEditor.onTokenSelect(updateSelectedTokenPanel);

    $('#btn-token-heal').addEventListener('click', () => {
      const id = MapEditor.tokenSystem.selectedId;
      if (!id) return;
      MapEditor.tokenSystem.modifyHp(id, 5);
      updateSelectedTokenPanel(id);
      appendLog(`💚 ${MapEditor.tokenSystem.getToken(id)?.name} healed 5 HP.`);
    });

    $('#btn-token-dmg').addEventListener('click', () => {
      const id = MapEditor.tokenSystem.selectedId;
      if (!id) return;
      MapEditor.tokenSystem.modifyHp(id, -5);
      updateSelectedTokenPanel(id);
      appendLog(`🩸 ${MapEditor.tokenSystem.getToken(id)?.name} took 5 damage.`);
    });

    $$('.token-act-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = MapEditor.tokenSystem.selectedId;
        if (!id) return;
        MapEditor.triggerTokenAction(id, btn.dataset.action);
        updateSelectedTokenPanel(id);
      });
    });

    // ── Combat tracker ────────────────────────────────────────────────────────
    const combatTrackerEl = $('#combat-tracker');

    function renderCombatTracker(state) {
      if (!state || !state.active || state.turnOrder.length === 0) {
        combatTrackerEl.innerHTML = '<p class="text-muted">No combat in progress.</p>';
        return;
      }
      combatTrackerEl.innerHTML = `
        <p class="combat-round">Round ${state.round}</p>
        <ul class="combat-turn-list">
          ${state.turnOrder.map((p, i) => `
            <li class="combat-turn-item${i === state.currentTurn ? ' active-turn' : ''}">
              <span class="combat-avatar">${p.avatar}</span>
              <span class="combat-name">${escHtml(p.name)}</span>
              <span class="combat-init">🎲 ${p.initiative}</span>
            </li>`).join('')}
        </ul>`;
    }

    MapEditor.setCombatCallback(renderCombatTracker);
    renderCombatTracker(null);

    $('#btn-start-combat').addEventListener('click', () => {
      const tokens = MapEditor.getTokens();
      if (tokens.length === 0) { alert('Add tokens to the map first.'); return; }
      MapEditor.startCombat();
      renderCombatTracker(MapEditor.combatSystem.combatState);
    });

    $('#btn-next-turn').addEventListener('click', () => {
      if (!MapEditor.combatSystem.combatState.active) return;
      MapEditor.nextTurn();
      renderCombatTracker(MapEditor.combatSystem.combatState);
    });

    $('#btn-end-combat').addEventListener('click', () => {
      MapEditor.endCombat();
      renderCombatTracker(null);
    });

    // ── Map controls ──────────────────────────────────────────────────────────
    $('#btn-fill-floor').addEventListener('click', () => MapEditor.fill('floor'));
    $('#btn-fill-wall').addEventListener('click',  () => MapEditor.fill('wall'));
    $('#btn-clear-map').addEventListener('click',  () => MapEditor.fill('empty'));

    // ── Resize ────────────────────────────────────────────────────────────────
    $('#btn-resize-map').addEventListener('click', () => {
      const c = parseInt($('#map-cols-input').value, 10) || 20;
      const r = parseInt($('#map-rows-input').value, 10) || 15;
      if (confirm(`Resize map to ${c}×${r}? Tiles outside the new bounds will be lost.`)) {
        MapEditor.resize(c, r);
        refreshTokenList();
      }
    });

    // ── Export PNG ────────────────────────────────────────────────────────────
    $('#btn-export-map').addEventListener('click', () => {
      const dataUrl = MapEditor.exportPNG();
      const a       = document.createElement('a');
      a.href        = dataUrl;
      a.download    = 'project-jo-map.png';
      a.click();
    });

    // ── Save / Load JSON ──────────────────────────────────────────────────────
    $('#btn-save-map').addEventListener('click', () => {
      const data = JSON.stringify(MapEditor.serialize());
      const blob = new Blob([data], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'project-jo-map.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    $('#btn-load-map').addEventListener('click', () => {
      $('#map-file-input').click();
    });

    $('#map-file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const data = JSON.parse(evt.target.result);
          MapEditor.deserialize(data);
          refreshTokenList();
        } catch {
          alert('Invalid map file.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // ── Map info updater ──────────────────────────────────────────────────────
    setInterval(() => {
      const infoEl = $('#map-info');
      if (infoEl) {
        const toolLabel = UIControls.TOOLS[MapEditor.activeTool]?.label || MapEditor.activeTool;
        const tileLabel = MapEditor.TILES[MapEditor.selectedTile]?.label || 'Erase';
        infoEl.textContent =
          `Size: ${MapEditor.cols} × ${MapEditor.rows}  |  ` +
          `Tool: ${toolLabel}  |  Tile: ${tileLabel}`;
      }
    }, 500);

    // ── Refresh token char select when map tab is opened ──────────────────────
    $('nav button[data-tab="map"]').addEventListener('click', () => {
      refreshTokenCharSelect();
      refreshTokenList();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ANIMATION PANEL
  // ══════════════════════════════════════════════════════════════════════════
  function initAnimationPanel() {
    const stageEl = $('#animation-stage');
    const logEl   = $('#anim-log');
    AnimationSystem.init(stageEl, logEl);

    // Populate character selector
    function refreshAnimCharSelect() {
      const sel = $('#anim-char-select');
      sel.innerHTML = state.characters.length === 0
        ? '<option value="">— No characters —</option>'
        : state.characters.map(c =>
            `<option value="${c.id}">${escHtml(c.name)}</option>`
          ).join('');
    }

    // Add character to stage button
    $('#btn-add-to-stage').addEventListener('click', () => {
      refreshAnimCharSelect();
      const sel  = $('#anim-char-select');
      const id   = Number(sel.value);
      const char = state.characters.find(c => c.id === id);
      if (!char) { alert('Select a character first.'); return; }
      const stW = stageEl.offsetWidth  || 600;
      const stH = stageEl.offsetHeight || 320;
      AnimationSystem.addCharacter(char.id, char.name, char.avatar,
        Math.floor(stW / 2) - 28, 60);
    });

    // Remove character from stage
    $('#btn-remove-from-stage').addEventListener('click', () => {
      const sel = $('#anim-char-select');
      const id  = Number(sel.value);
      AnimationSystem.removeCharacter(id);
    });

    // Action buttons
    const actionContainer = $('#anim-action-buttons');
    AnimationSystem.ACTION_KEYS.forEach(key => {
      const action = AnimationSystem.ACTIONS[key];
      const btn    = document.createElement('button');
      btn.className   = 'btn btn-secondary';
      btn.textContent = `${action.icon} ${action.label}`;
      btn.addEventListener('click', () => {
        const sel  = $('#anim-char-select');
        const id   = Number(sel.value);
        if (!id) { alert('Select a character first.'); return; }
        AnimationSystem.triggerAction(id, key);
      });
      actionContainer.appendChild(btn);
    });

    // Refresh select whenever the animation tab is shown
    $('nav button[data-tab="animation"]').addEventListener('click', refreshAnimCharSelect);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Utility
  // ══════════════════════════════════════════════════════════════════════════
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Bootstrap
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initDicePanel();
    initCharacterPanel();
    initInventoryPanel();
    initMapPanel();
    initAnimationPanel();
  });

})();
