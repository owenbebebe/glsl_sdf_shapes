/* =============================================================================
   SDF Shape Editor — shader.js
   Manages up to MAX_SHAPES placed circles, passes them to GLSL as flattened
   per-slot uniforms, and handles all toolbar / canvas interaction.
   ============================================================================= */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_SHAPES        = 16;
const DEFAULT_RADIUS    = 0.18;   // in normalised coords (Y spans -1..+1)
const HIT_TOLERANCE     = 0.015;  // extra px tolerance for selection clicks
const SCALE_SENSITIVITY = 0.004;  // radius change per drag pixel
const DEFAULT_BLEND_K   = 0.12;   // initial smooth-union blend radius

// ─── GlslCanvas setup ────────────────────────────────────────────────────────

const canvas  = document.getElementById('c');
const canvasWrap = document.getElementById('canvas-wrap');

function syncCanvasSize() {
  canvas.width  = canvasWrap.clientWidth;
  canvas.height = canvasWrap.clientHeight;
}
syncCanvasSize();

const sandbox = new GlslCanvas(canvas);

window.addEventListener('resize', () => {
  syncCanvasSize();
  sandbox.resize();
  pushUniforms();
});

// ─── Shape state ─────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: number, cx: number, cy: number, radius: number }} Shape
 * All coordinates are in normalised shader space:
 *   x ∈ (-aspect, +aspect),  y ∈ (-1, +1)
 * matching the shader's:  st = (2*fragCoord - res) / res.y
 */

let shapes      = [];   // Shape[]
let nextId      = 0;
let selectedId  = -1;   // shape.id of selected shape, or -1
let blendK      = DEFAULT_BLEND_K;

// ─── Tool / interaction state ─────────────────────────────────────────────────

/** @type {'circle' | 'scale' | 'select'} */
let activeTool = 'circle';

const drag = {
  active     : false,
  mode       : '',        // 'move' | 'scale'
  startX     : 0,
  startY     : 0,
  origCx     : 0,
  origCy     : 0,
  origRadius : 0,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const btnCircle     = document.getElementById('tool-circle');
const btnScale      = document.getElementById('tool-scale');
const btnDelete     = document.getElementById('tool-delete');
const toggleEdBtn   = document.getElementById('toggle-editor');
const topEl         = document.getElementById('top');
const hintEl        = document.getElementById('canvas-hint');
const countLabel    = document.getElementById('shape-count-label');
const statusBar     = document.getElementById('status-bar');
const editor        = document.getElementById('shader-editor');
const runBtn        = document.getElementById('run-btn');
const blendSlider   = document.getElementById('blend-slider');
const blendValueEl  = document.getElementById('blend-value');

// ─── Coordinate helpers ───────────────────────────────────────────────────────

/**
 * Convert a canvas-relative pixel position to the normalised shader space.
 * Shader space: origin at canvas centre, Y up, scaled by canvas height.
 */
function pixelToNorm(px, py) {
  const w = canvas.width;
  const h = canvas.height;
  return {
    x: (2 * px - w) / h,
    y: (2 * (h - py) - h) / h,  // flip Y (canvas Y is down, shader Y is up)
  };
}

/** Canvas-relative pixel position from a mouse/pointer event. */
function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    px: e.clientX - rect.left,
    py: e.clientY - rect.top,
  };
}

// ─── Shape helpers ────────────────────────────────────────────────────────────

function findShapeById(id) {
  return shapes.find(s => s.id === id) ?? null;
}

/**
 * Hit-test all shapes against a normalised point.
 * Returns the id of the topmost (last placed) shape under the cursor, or -1.
 */
function hitTest(nx, ny) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const dx = nx - s.cx;
    const dy = ny - s.cy;
    if (Math.sqrt(dx * dx + dy * dy) <= s.radius + HIT_TOLERANCE) {
      return s.id;
    }
  }
  return -1;
}

function getSelectedShape() {
  return selectedId >= 0 ? findShapeById(selectedId) : null;
}

// ─── Uniform push ─────────────────────────────────────────────────────────────

/**
 * Push all shape data and selection state to the shader as individual uniforms.
 * GlslCanvas does not support GLSL array uniforms, so each slot is flattened:
 *   u_shape_center[i]  →  u_shape_center_0 … u_shape_center_15
 *   u_shape_radius[i]  →  u_shape_radius_0 … u_shape_radius_15
 */
function pushUniforms() {
  for (let i = 0; i < MAX_SHAPES; i++) {
    const s = shapes[i];
    if (s) {
      sandbox.setUniform(`u_shape_center_${i}`, s.cx, s.cy);
      sandbox.setUniform(`u_shape_radius_${i}`, s.radius);
    } else {
      sandbox.setUniform(`u_shape_center_${i}`, 0.0, 0.0);
      sandbox.setUniform(`u_shape_radius_${i}`, -1.0);  // sentinel: inactive
    }
  }
  sandbox.setUniform('u_shape_count', shapes.length);

  // Blend radius
  sandbox.setUniform('u_blend_k', blendK);

  // Map selectedId (shape identity) → array index expected by the shader
  let selIndex = -1;
  if (selectedId >= 0) {
    selIndex = shapes.findIndex(s => s.id === selectedId);
    if (selIndex < 0) selIndex = -1;
  }
  sandbox.setUniform('u_selected', selIndex);
}

// ─── UI sync ──────────────────────────────────────────────────────────────────

function setCursor(name) {
  canvasWrap.className = canvasWrap.className
    .replace(/\bcursor-\S+/g, '')
    .trim();
  canvasWrap.classList.add(`cursor-${name}`);
}

function updateHint() {
  let text = '';
  if (activeTool === 'circle') {
    text = shapes.length >= MAX_SHAPES
      ? 'Shape limit reached (16)'
      : 'Click to place a circle';
  } else if (activeTool === 'scale') {
    text = getSelectedShape() ? 'Drag up/down to scale' : 'Select a shape first';
  } else {
    text = getSelectedShape() ? 'Drag to move  ·  press S to scale  ·  Del to delete' : 'Click a shape to select';
  }
  hintEl.textContent = text;
  hintEl.classList.remove('hidden');
}

function syncToolbar() {
  const hasSel = getSelectedShape() !== null;

  // Active state on circle button
  btnCircle.classList.toggle('active', activeTool === 'circle');
  btnScale.classList.toggle('active',  activeTool === 'scale');

  // Scale and Delete are only usable when a shape is selected
  btnScale.disabled  = !hasSel;
  btnDelete.disabled = !hasSel;

  // Cursor
  if (activeTool === 'circle') {
    setCursor(shapes.length >= MAX_SHAPES ? 'default' : 'crosshair');
  } else if (activeTool === 'scale') {
    setCursor(hasSel ? 'nesw' : 'default');
  } else {
    setCursor('default');
  }

  countLabel.textContent = `${shapes.length} / ${MAX_SHAPES} shapes`;
  updateHint();
}

// ─── Shape operations ─────────────────────────────────────────────────────────

function addShape(nx, ny) {
  if (shapes.length >= MAX_SHAPES) return;
  const s = { id: nextId++, cx: nx, cy: ny, radius: DEFAULT_RADIUS };
  shapes.push(s);
  selectedId = s.id;
  pushUniforms();
  syncToolbar();
}

function deleteSelected() {
  if (selectedId < 0) return;
  shapes = shapes.filter(s => s.id !== selectedId);
  selectedId = -1;
  pushUniforms();
  syncToolbar();
}

function selectShape(id) {
  selectedId = id;
  pushUniforms();
  syncToolbar();
}

function deselect() {
  selectedId = -1;
  pushUniforms();
  syncToolbar();
}

// ─── Canvas mouse interaction ─────────────────────────────────────────────────

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const { px, py } = canvasPos(e);
  const { x: nx, y: ny } = pixelToNorm(px, py);

  if (activeTool === 'circle') {
    addShape(nx, ny);
    // Immediately switch to select so the user can drag the new shape
    activeTool = 'select';
    drag.active     = true;
    drag.mode       = 'move';
    drag.startX     = nx;
    drag.startY     = ny;
    const sel = getSelectedShape();
    drag.origCx     = sel.cx;
    drag.origCy     = sel.cy;
    drag.origRadius = sel.radius;
    setCursor('move');
    syncToolbar();
    return;
  }

  // select / scale tool — first try to hit a shape
  const hitId = hitTest(nx, ny);

  if (activeTool === 'scale') {
    if (hitId >= 0) selectShape(hitId);
    const sel = getSelectedShape();
    if (!sel) return;
    drag.active     = true;
    drag.mode       = 'scale';
    drag.startX     = px;
    drag.startY     = py;
    drag.origRadius = sel.radius;
    setCursor('nesw');
    return;
  }

  // select tool
  if (hitId >= 0) {
    selectShape(hitId);
    const sel = getSelectedShape();
    drag.active  = true;
    drag.mode    = 'move';
    drag.startX  = nx;
    drag.startY  = ny;
    drag.origCx  = sel.cx;
    drag.origCy  = sel.cy;
    setCursor('move');
  } else {
    deselect();
  }
});

canvas.addEventListener('mousemove', e => {
  if (!drag.active) {
    // Update cursor on hover in select mode
    if (activeTool === 'select') {
      const { px, py } = canvasPos(e);
      const { x: nx, y: ny } = pixelToNorm(px, py);
      const hoverId = hitTest(nx, ny);
      setCursor(hoverId >= 0 ? 'move' : 'default');
    }
    return;
  }

  const sel = getSelectedShape();
  if (!sel) { drag.active = false; return; }

  if (drag.mode === 'move') {
    const { px, py } = canvasPos(e);
    const { x: nx, y: ny } = pixelToNorm(px, py);
    sel.cx = drag.origCx + (nx - drag.startX);
    sel.cy = drag.origCy + (ny - drag.startY);
    pushUniforms();
  } else if (drag.mode === 'scale') {
    const { py } = canvasPos(e);
    const delta = drag.startY - py;   // drag up → bigger
    sel.radius = Math.max(0.03, drag.origRadius + delta * SCALE_SENSITIVITY);
    pushUniforms();
  }
});

window.addEventListener('mouseup', () => {
  if (!drag.active) return;
  drag.active = false;
  syncToolbar();
});

// ─── Toolbar button wiring ────────────────────────────────────────────────────

btnCircle.addEventListener('click', () => {
  activeTool = 'circle';
  syncToolbar();
});

btnScale.addEventListener('click', () => {
  activeTool = activeTool === 'scale' ? 'select' : 'scale';
  syncToolbar();
});

btnDelete.addEventListener('click', deleteSelected);

blendSlider.addEventListener('input', () => {
  blendK = parseFloat(blendSlider.value);
  blendValueEl.textContent = blendK.toFixed(2);
  pushUniforms();
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  // Skip when typing in the shader editor
  if (e.target === editor) return;

  switch (e.key) {
    case 'c': case 'C':
      activeTool = 'circle'; syncToolbar(); break;
    case 's': case 'S':
      if (getSelectedShape()) { activeTool = activeTool === 'scale' ? 'select' : 'scale'; syncToolbar(); } break;
    case 'Delete': case 'Backspace':
      deleteSelected(); break;
    case 'Escape':
      if (activeTool !== 'select') { activeTool = 'select'; syncToolbar(); }
      else deselect();
      break;
  }
});

// ─── Editor panel toggle ──────────────────────────────────────────────────────

toggleEdBtn.addEventListener('click', () => {
  topEl.classList.toggle('editor-hidden');
  toggleEdBtn.textContent = topEl.classList.contains('editor-hidden')
    ? 'Editor ▶' : 'Editor ◀';
  setTimeout(() => { syncCanvasSize(); sandbox.resize(); pushUniforms(); }, 350);
});

// ─── GLSL editor compile ──────────────────────────────────────────────────────

function setStatus(ok, msg) {
  statusBar.textContent = ok ? `✓ ${msg}` : `✗ ${msg}`;
  statusBar.className   = ok ? 'ok' : 'err';
}

function runShader() {
  const src = editor.value;
  sandbox.load(src);
  requestAnimationFrame(() => {
    const gl = sandbox.gl;
    const pg = sandbox.program;
    if (pg && gl.getProgramParameter(pg, gl.LINK_STATUS)) {
      setStatus(true, 'compiled');
      pushUniforms();   // re-push shape data after recompile
    } else {
      const log = (pg ? gl.getProgramInfoLog(pg) : '') || 'shader compilation error';
      console.error(log);
      setStatus(false, log.trim());
    }
  });
}

runBtn.addEventListener('click', runShader);

editor.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runShader(); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart;
    editor.setRangeText('  ', s, s, 'end');
  }
});

// ─── Boot: fetch shader.frag → load into editor → compile ────────────────────

fetch('shader.frag')
  .then(r => r.text())
  .then(src => { editor.value = src; runShader(); })
  .catch(() => {
    editor.value = [
      '#ifdef GL_ES', 'precision highp float;', '#endif', '',
      'uniform float u_time;', 'uniform vec2  u_resolution;', '',
      'void main() {',
      '  vec2 uv = gl_FragCoord.xy / u_resolution;',
      '  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0,2,4));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n');
    runShader();
  });

// Initial toolbar sync
syncToolbar();
