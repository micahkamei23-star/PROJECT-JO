/**
 * InteractionManager.js – Centralized Canvas Input Handler
 *
 * Single source of truth for all pointer input on the map canvas.
 * Delegates viewport/tool handling to UIControls and token dragging
 * to TokenSystem, while routing every interaction through EventBus.
 *
 * EventBus events emitted:
 *   input:pointerdown   { worldX, worldY, col, row, consumed }
 *   input:pointermove   { worldX, worldY, col, row, consumed }
 *   input:pointerup     {}
 *   input:hover         { worldX, worldY, col, row }
 *   input:contextmenu   { context:'token'|'tile'|'map', worldX, worldY,
 *                         col, row, token?, tile? }
 *
 * Usage:
 *   InteractionManager.init(canvasEl, opts);
 *
 * opts extends UIControls.init opts with:
 *   getTokenAt(worldX, worldY)        → token object or null
 *   getTileAt(row, col)               → tile object or null
 *   onContextToken(token)             → called on right-click over token
 *   onContextTile(tile, row, col)     → called on right-click over tile
 *   onContextMap(col, row)            → called on right-click over empty map
 */

const InteractionManager = (() => {
  'use strict';

  const _hasEventBus = typeof EventBus !== 'undefined';

  let _canvas      = null;
  let _tileSize    = 40;
  let _getTokenAt  = null;
  let _getTileAt   = null;
  let _onContextToken = null;
  let _onContextTile  = null;
  let _onContextMap   = null;

  /**
   * Initialise the interaction manager.
   * Internally calls UIControls.init and UIControls.bindCanvas, then
   * adds contextmenu routing on top.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {Object} opts  All UIControls.init options, plus the context callbacks above.
   */
  function init(canvas, opts) {
    _canvas   = canvas;
    _tileSize = (opts && opts.tileSize) || 40;

    _getTokenAt     = (opts && opts.getTokenAt)     || null;
    _getTileAt      = (opts && opts.getTileAt)      || null;
    _onContextToken = (opts && opts.onContextToken) || null;
    _onContextTile  = (opts && opts.onContextTile)  || null;
    _onContextMap   = (opts && opts.onContextMap)   || null;

    // Wrap pointer callbacks to also emit EventBus events,
    // then pass the augmented opts to UIControls.
    const wrappedOpts = Object.assign({}, opts);

    wrappedOpts.onPointerDown = function (wx, wy) {
      var col      = Math.floor(wx / _tileSize);
      var row      = Math.floor(wy / _tileSize);
      var consumed = opts.onPointerDown ? opts.onPointerDown(wx, wy) : false;
      if (_hasEventBus) {
        EventBus.emit('input:pointerdown', { worldX: wx, worldY: wy, col: col, row: row, consumed: consumed });
      }
      return consumed;
    };

    wrappedOpts.onPointerMove = function (wx, wy) {
      var col      = Math.floor(wx / _tileSize);
      var row      = Math.floor(wy / _tileSize);
      var consumed = opts.onPointerMove ? opts.onPointerMove(wx, wy) : false;
      if (_hasEventBus) {
        EventBus.emit('input:pointermove', { worldX: wx, worldY: wy, col: col, row: row, consumed: consumed });
      }
      return consumed;
    };

    wrappedOpts.onPointerUp = function () {
      if (opts.onPointerUp) opts.onPointerUp();
      if (_hasEventBus) EventBus.emit('input:pointerup', {});
    };

    // Delegate viewport/tool/drag to UIControls (unchanged)
    UIControls.init(wrappedOpts);
    UIControls.bindCanvas(canvas);

    // Right-click context menu – prevent browser menu, then route
    canvas.addEventListener('contextmenu', function (e) {
      _handleContextMenu(e);
    });
  }

  // ── Right-click handler ────────────────────────────────────────────────────

  function _handleContextMenu(e) {
    e.preventDefault();

    var pt   = UIControls.canvasPoint(_canvas, e.clientX, e.clientY);
    var wld  = UIControls.canvasToWorld(pt.px, pt.py);
    var wx   = wld.wx;
    var wy   = wld.wy;
    var col  = Math.floor(wx / _tileSize);
    var row  = Math.floor(wy / _tileSize);

    var context = 'map';
    var token   = null;
    var tile    = null;

    // 1. Check for token (top priority)
    if (_getTokenAt) {
      token = _getTokenAt(wx, wy);
      if (token) {
        context = 'token';
        if (_onContextToken) _onContextToken(token);
      }
    }

    // 2. Check for tile if no token
    if (!token && _getTileAt) {
      tile = _getTileAt(row, col);
      if (tile && tile.type) {
        context = 'tile';
        if (_onContextTile) _onContextTile(tile, row, col);
      }
    }

    // 3. Empty map
    if (context === 'map' && _onContextMap) {
      _onContextMap(col, row);
    }

    if (_hasEventBus) {
      EventBus.emit('input:contextmenu', {
        context: context,
        worldX:  wx,
        worldY:  wy,
        col:     col,
        row:     row,
        token:   token,
        tile:    tile,
      });
    }
  }

  return { init: init };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InteractionManager;
}
