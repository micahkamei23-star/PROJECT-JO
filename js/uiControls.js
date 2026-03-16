/**
 * uiControls.js – Map Editor UI Controls
 * Handles tool selection, viewport transform, and all mouse/touch input.
 *
 * Tools:
 *   brush   – paint tiles by tapping / dragging
 *   eraser  – remove tiles
 *   fill    – flood fill an area
 *   rect    – drag to paint a rectangular room
 *
 * Viewport:
 *   scroll wheel  – zoom centred on cursor
 *   two-finger    – pinch to zoom, drag to pan
 */

const UIControls = (() => {
  'use strict';

  const TOOLS = {
    brush:  { label: 'Brush',     icon: '🖌️', cursor: 'crosshair' },
    eraser: { label: 'Eraser',    icon: '🧹', cursor: 'cell' },
    fill:   { label: 'Fill',      icon: '🪣', cursor: 'copy' },
    rect:   { label: 'Rectangle', icon: '⬛', cursor: 'crosshair' },
    line:   { label: 'Line',      icon: '📏', cursor: 'crosshair' },
  };

  // Tool & grid state
  let _activeTool = 'brush';
  let _showGrid   = true;
  let _tileSize   = 40;

  // Viewport transform
  let _offsetX = 0, _offsetY = 0, _scale = 1;

  // Interaction state
  let _isPainting    = false;
  let _rectStart     = null;
  let _rectEnd       = null;
  let _lineStart     = null;
  let _lineEnd       = null;
  let _lastTouchDist = 0;
  let _lastTouchMid  = null;
  let _hoveredCell   = null;

  // External callbacks
  let _onPaint       = null;   // (row, col, tool) => void
  let _onFill        = null;   // (row, col) => void
  let _onRect        = null;   // (r1, c1, r2, c2) => void
  let _onLine        = null;   // (r1, c1, r2, c2) => void
  let _onViewChange  = null;   // () => void
  let _onPointerDown = null;   // (worldX, worldY) => bool  – true = consumed
  let _onPointerMove = null;   // (worldX, worldY) => bool
  let _onPointerUp   = null;   // () => void

  // ── Initialise ─────────────────────────────────────────────────────────────

  function init(opts) {
    _onPaint       = opts.onPaint       || null;
    _onFill        = opts.onFill        || null;
    _onRect        = opts.onRect        || null;
    _onLine        = opts.onLine        || null;
    _onViewChange  = opts.onViewChange  || null;
    _onPointerDown = opts.onPointerDown || null;
    _onPointerMove = opts.onPointerMove || null;
    _onPointerUp   = opts.onPointerUp   || null;
    _tileSize      = opts.tileSize      || 40;
  }

  function bindCanvas(canvas) {
    canvas.addEventListener('mousedown',  e => _mouseDown(canvas, e));
    canvas.addEventListener('mousemove',  e => _mouseMove(canvas, e));
    canvas.addEventListener('mouseup',    e => _mouseUp(canvas, e));
    canvas.addEventListener('mouseleave', e => _mouseLeave(canvas, e));
    canvas.addEventListener('touchstart', e => _touchStart(canvas, e), { passive: false });
    canvas.addEventListener('touchmove',  e => _touchMove(canvas, e),  { passive: false });
    canvas.addEventListener('touchend',   e => _touchEnd(canvas, e),   { passive: false });
    canvas.addEventListener('wheel',      e => _wheel(canvas, e),      { passive: false });
  }

  // ── Coordinate helpers ──────────────────────────────────────────────────────

  function canvasPoint(canvas, clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { px: clientX - r.left, py: clientY - r.top };
  }

  function canvasToWorld(px, py) {
    return { wx: (px - _offsetX) / _scale, wy: (py - _offsetY) / _scale };
  }

  function worldToGrid(wx, wy) {
    return { col: Math.floor(wx / _tileSize), row: Math.floor(wy / _tileSize) };
  }

  function _fullConvert(canvas, clientX, clientY) {
    const { px, py } = canvasPoint(canvas, clientX, clientY);
    const { wx, wy } = canvasToWorld(px, py);
    const { col, row } = worldToGrid(wx, wy);
    return { px, py, wx, wy, col, row };
  }

  // ── Mouse events ────────────────────────────────────────────────────────────

  function _mouseDown(canvas, e) {
    if (e.button !== 0) return;
    const { wx, wy, col, row } = _fullConvert(canvas, e.clientX, e.clientY);

    // Let token system handle first (token drag takes priority)
    if (_onPointerDown && _onPointerDown(wx, wy)) return;

    if (_activeTool === 'fill') {
      if (_onFill) _onFill(row, col);
      return;
    }
    _isPainting = true;
    if (_activeTool === 'rect') {
      _rectStart = { row, col };
      _rectEnd   = null;
    } else if (_activeTool === 'line') {
      _lineStart = { row, col };
      _lineEnd   = null;
    } else {
      if (_onPaint) _onPaint(row, col, _activeTool);
    }
  }

  function _mouseMove(canvas, e) {
    const { wx, wy, col, row } = _fullConvert(canvas, e.clientX, e.clientY);
    _hoveredCell = { row, col };

    if (_onPointerMove && _onPointerMove(wx, wy)) {
      if (_onViewChange) _onViewChange();
      return;
    }
    if (_isPainting) {
      if (_activeTool === 'rect') {
        _rectEnd = { row, col };
      } else if (_activeTool === 'line') {
        _lineEnd = { row, col };
      } else {
        if (_onPaint) _onPaint(row, col, _activeTool);
      }
    }
    if (_onViewChange) _onViewChange();
  }

  function _mouseUp(canvas, e) {
    if (_onPointerUp) _onPointerUp();
    if (_isPainting && _activeTool === 'rect' && _rectStart && _rectEnd) {
      if (_onRect) _onRect(_rectStart.row, _rectStart.col, _rectEnd.row, _rectEnd.col);
    }
    if (_isPainting && _activeTool === 'line' && _lineStart && _lineEnd) {
      if (_onLine) _onLine(_lineStart.row, _lineStart.col, _lineEnd.row, _lineEnd.col);
    }
    _isPainting = false;
    _rectStart  = null;
    _rectEnd    = null;
    _lineStart  = null;
    _lineEnd    = null;
  }

  function _mouseLeave(canvas, e) {
    _mouseUp(canvas, e);
    _hoveredCell = null;
    if (_onViewChange) _onViewChange();
  }

  // ── Wheel zoom ──────────────────────────────────────────────────────────────

  function _wheel(canvas, e) {
    e.preventDefault();
    const { px, py } = canvasPoint(canvas, e.clientX, e.clientY);
    _zoomAt(px, py, e.deltaY > 0 ? 0.9 : 1.1);
  }

  function _zoomAt(px, py, factor) {
    const newScale = Math.max(0.25, Math.min(5, _scale * factor));
    _offsetX = px - (px - _offsetX) * (newScale / _scale);
    _offsetY = py - (py - _offsetY) * (newScale / _scale);
    _scale   = newScale;
    if (_onViewChange) _onViewChange();
  }

  // ── Touch events ─────────────────────────────────────────────────────────────

  function _touchStart(canvas, e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const { wx, wy, col, row } = _fullConvert(canvas, t.clientX, t.clientY);
      if (_onPointerDown && _onPointerDown(wx, wy)) return;
      if (_activeTool === 'fill') { if (_onFill) _onFill(row, col); return; }
      _isPainting = true;
      if (_activeTool === 'rect') {
        _rectStart = { row, col };
        _rectEnd   = null;
      } else if (_activeTool === 'line') {
        _lineStart = { row, col };
        _lineEnd   = null;
      } else {
        if (_onPaint) _onPaint(row, col, _activeTool);
      }
    } else if (e.touches.length === 2) {
      _isPainting    = false;
      _rectStart     = null;
      _rectEnd       = null;
      _lineStart     = null;
      _lineEnd       = null;
      _lastTouchDist = _dist(e.touches[0], e.touches[1]);
      _lastTouchMid  = _mid(canvas, e.touches[0], e.touches[1]);
    }
  }

  function _touchMove(canvas, e) {
    e.preventDefault();
    if (e.touches.length === 1 && _isPainting) {
      const t = e.touches[0];
      const { wx, wy, col, row } = _fullConvert(canvas, t.clientX, t.clientY);
      _hoveredCell = { row, col };
      if (_onPointerMove && _onPointerMove(wx, wy)) {
        if (_onViewChange) _onViewChange();
        return;
      }
      if (_activeTool === 'rect') {
        _rectEnd = { row, col };
      } else if (_activeTool === 'line') {
        _lineEnd = { row, col };
      } else if (_onPaint) {
        _onPaint(row, col, _activeTool);
      }
      if (_onViewChange) _onViewChange();
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const newDist = _dist(t1, t2);
      const newMid  = _mid(canvas, t1, t2);

      // Pinch-to-zoom
      if (_lastTouchDist > 0) {
        _zoomAt(newMid.px, newMid.py, newDist / _lastTouchDist);
      }
      // Two-finger pan
      if (_lastTouchMid) {
        _offsetX += newMid.px - _lastTouchMid.px;
        _offsetY += newMid.py - _lastTouchMid.py;
        if (_onViewChange) _onViewChange();
      }

      _lastTouchDist = newDist;
      _lastTouchMid  = newMid;
    }
  }

  function _touchEnd(canvas, e) {
    e.preventDefault();
    if (e.touches.length < 2) {
      _lastTouchDist = 0;
      _lastTouchMid  = null;
    }
    if (e.touches.length === 0) {
      if (_onPointerUp) _onPointerUp();
      if (_isPainting && _activeTool === 'rect' && _rectStart && _rectEnd) {
        if (_onRect) _onRect(_rectStart.row, _rectStart.col, _rectEnd.row, _rectEnd.col);
      }
      if (_isPainting && _activeTool === 'line' && _lineStart && _lineEnd) {
        if (_onLine) _onLine(_lineStart.row, _lineStart.col, _lineEnd.row, _lineEnd.col);
      }
      _isPainting = false;
      _rectStart  = null;
      _rectEnd    = null;
      _lineStart  = null;
      _lineEnd    = null;
    }
  }

  // ── Touch helpers ───────────────────────────────────────────────────────────

  function _dist(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  function _mid(canvas, t1, t2) {
    const r = canvas.getBoundingClientRect();
    return {
      px: (t1.clientX + t2.clientX) / 2 - r.left,
      py: (t1.clientY + t2.clientY) / 2 - r.top,
    };
  }

  // ── View helpers ─────────────────────────────────────────────────────────────

  function resetView() {
    _offsetX = 0; _offsetY = 0; _scale = 1;
    if (_onViewChange) _onViewChange();
  }

  function fitToCanvas(canvasEl, mapCols, mapRows) {
    const rect   = canvasEl.getBoundingClientRect();
    const scaleX = rect.width  / (mapCols * _tileSize);
    const scaleY = rect.height / (mapRows * _tileSize);
    _scale   = Math.min(scaleX, scaleY, 1);
    _offsetX = 0;
    _offsetY = 0;
    if (_onViewChange) _onViewChange();
  }

  return {
    TOOLS,
    get activeTool()  { return _activeTool; },
    set activeTool(v) { _activeTool = v; },
    get showGrid()    { return _showGrid; },
    set showGrid(v)   { _showGrid = v; if (_onViewChange) _onViewChange(); },
    get offsetX()     { return _offsetX; },
    get offsetY()     { return _offsetY; },
    get scale()       { return _scale; },
    get hoveredCell() { return _hoveredCell; },
    get rectStart()   { return _rectStart; },
    get rectEnd()     { return _rectEnd; },
    get lineStart()   { return _lineStart; },
    get lineEnd()     { return _lineEnd; },
    get isPainting()  { return _isPainting; },
    get tileSize()    { return _tileSize; },
    set tileSize(v)   { _tileSize = v; },
    init,
    bindCanvas,
    canvasPoint,
    canvasToWorld,
    worldToGrid,
    resetView,
    fitToCanvas,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIControls;
}
