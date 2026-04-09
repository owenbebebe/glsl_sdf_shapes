// ─── Shadertoy compatibility wrapper ───────────────────────────────
const FRAG_PREFIX = `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;

out vec4 fragColor;

`;

const FRAG_SUFFIX = `

void main() {
  mainImage(fragColor, gl_FragCoord.xy);
}
`;

// ─── WebGL setup ────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const gl     = canvas.getContext('webgl2');

if (!gl) {
  document.getElementById('status-bar').textContent = '✗ WebGL2 not supported';
  document.getElementById('status-bar').className   = 'err';
}

function resize() {
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

let mouse = [0, 0];
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse = [e.clientX - r.left, canvas.height - (e.clientY - r.top)];
});

// ─── Shader compilation helpers ─────────────────────────────────────
function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}

function buildProgram(vsSrc, fsSrc) {
  const vs = compileShader(gl.VERTEX_SHADER,   vsSrc);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);

  const pg = gl.createProgram();
  gl.attachShader(pg, vs);
  gl.attachShader(pg, fs);
  gl.linkProgram(pg);

  if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(pg);
    gl.deleteProgram(pg);
    throw new Error(log);
  }
  return pg;
}

// ─── Full-screen triangle ────────────────────────────────────────────
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER,
  new Float32Array([-1, -1,  3, -1,  -1,  3]),
  gl.STATIC_DRAW
);

function bindQuad(pg) {
  const loc = gl.getAttribLocation(pg, 'a_position');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

// ─── Program state ──────────────────────────────────────────────────
const vsSrc = document.getElementById('vs').textContent;
let currentPg = null;
let uTime, uRes, uMouse;

function loadProgram(userFrag) {
  const fullFrag = FRAG_PREFIX + userFrag + FRAG_SUFFIX;
  const pg = buildProgram(vsSrc, fullFrag);  // throws on error

  if (currentPg) gl.deleteProgram(currentPg);
  currentPg = pg;

  gl.useProgram(pg);
  bindQuad(pg);

  uTime  = gl.getUniformLocation(pg, 'u_time');
  uRes   = gl.getUniformLocation(pg, 'u_resolution');
  uMouse = gl.getUniformLocation(pg, 'u_mouse');
}

// ─── Status bar ─────────────────────────────────────────────────────
const statusBar = document.getElementById('status-bar');

function setStatus(ok, msg) {
  statusBar.textContent = ok ? `✓ ${msg}` : `✗ ${msg}`;
  statusBar.className   = ok ? 'ok' : 'err';
}

// Strip the injected line count so error lines point to user code
function cleanError(raw) {
  // FRAG_PREFIX is 9 lines — subtract to point at user's line numbers
  const prefixLines = FRAG_PREFIX.split('\n').length - 1;
  return raw.replace(/(\d+):(\d+)/g, (_, col, line) => {
    const userLine = parseInt(line, 10) - prefixLines;
    return `${col}:${userLine < 1 ? line : userLine}`;
  });
}

// ─── Editor wiring ──────────────────────────────────────────────────
const editor  = document.getElementById('shader-editor');
const runBtn  = document.getElementById('run-btn');
const DEFAULT = document.getElementById('fs-default').textContent.trim();

editor.value = DEFAULT;

function runShader() {
  try {
    loadProgram(editor.value);
    setStatus(true, 'compiled');
  } catch (e) {
    console.error(e.message);
    setStatus(false, cleanError(e.message).trim());
  }
}

runBtn.addEventListener('click', runShader);

// Ctrl+Enter / Cmd+Enter to run
editor.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runShader();
  }
  // Tab → indent
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = editor.selectionStart;
    editor.setRangeText('  ', s, s, 'end');
  }
});

// ─── Render loop ────────────────────────────────────────────────────
const startTime = performance.now();

function frame() {
  requestAnimationFrame(frame);
  if (!currentPg) return;

  const t = (performance.now() - startTime) / 1000;
  gl.uniform1f(uTime,  t);
  gl.uniform2f(uRes,   canvas.width, canvas.height);
  gl.uniform2f(uMouse, mouse[0], mouse[1]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ─── Boot ────────────────────────────────────────────────────────────
runShader();
frame();
