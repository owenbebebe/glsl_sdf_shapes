// ─── GlslCanvas setup ──────────────────────────────────────────────
const canvas = document.getElementById('c');

// Set initial canvas pixel dimensions to match CSS layout
canvas.width  = canvas.clientWidth  || 500;
canvas.height = canvas.clientHeight || 500;

// Create the GlslCanvas instance
const sandbox = new GlslCanvas(canvas);

window.addEventListener('resize', () => {
  canvas.width  = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  sandbox.resize();
});

// ─── Status bar ─────────────────────────────────────────────────────
const statusBar = document.getElementById('status-bar');

function setStatus(ok, msg) {
  statusBar.textContent = ok ? `✓ ${msg}` : `✗ ${msg}`;
  statusBar.className   = ok ? 'ok' : 'err';
}

// ─── Editor wiring ──────────────────────────────────────────────────
const editor = document.getElementById('shader-editor');
const runBtn = document.getElementById('run-btn');

function runShader() {
  const src = editor.value;
  sandbox.load(src);

  // Give GlslCanvas a frame to compile, then check status
  requestAnimationFrame(() => {
    const gl = sandbox.gl;
    const pg = sandbox.program;
    if (pg && gl.getProgramParameter(pg, gl.LINK_STATUS)) {
      setStatus(true, 'compiled');
    } else {
      const log = (pg ? gl.getProgramInfoLog(pg) : '') || 'shader compilation error';
      console.error(log);
      setStatus(false, log.trim());
    }
  });
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

// ─── Boot: load shader.frag into editor and compile ─────────────────
fetch('shader.frag')
  .then(r => r.text())
  .then(src => {
    editor.value = src;
    runShader();
  })
  .catch(() => {
    // Fallback if fetch fails — use a simple default
    editor.value = [
      '#ifdef GL_ES',
      'precision highp float;',
      '#endif',
      '',
      'uniform float u_time;',
      'uniform vec2  u_resolution;',
      '',
      'void main() {',
      '  vec2 uv = gl_FragCoord.xy / u_resolution;',
      '  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0,2,4));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n');
    runShader();
  });
