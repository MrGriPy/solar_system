import * as THREE from 'three';
import { PLANETS, SUN_DATA, MOON_DATA, DWARF_PLANETS, buildAliasMap } from './planetData.js';

// ── Info Panel ────────────────────────────────────────────────────────────────

const BODY_TEXTURE_MAP = {
  soleil:   '/textures/sun.jpg',
  mercure:  '/textures/mercury.jpg',
  venus:    '/textures/venus.jpg',
  terre:    '/textures/earth.jpg',
  mars:     '/textures/mars.jpg',
  jupiter:  '/textures/jupiter.jpg',
  saturne:  '/textures/saturn.jpg',
  uranus:   '/textures/uranus.jpg',
  neptune:  '/textures/neptune.jpg',
  lune:     '/textures/moon.jpg',
  ceres:    '/textures/ceres.jpg',
  pluto:    '/textures/pluto.jpg',
  eris:     '/textures/eris.jpg',
  haumea:   '/textures/haumea.jpg',
  makemake: '/textures/makemake.jpg',
};

export function showInfoPanel(data) {
  const panel     = document.getElementById('info-panel');
  const icon      = document.getElementById('info-planet-icon');
  const name      = document.getElementById('info-name');
  const subtitle  = document.getElementById('info-subtitle');
  const grid      = document.getElementById('info-grid');
  const desc      = document.getElementById('info-description');

  const imgSrc = BODY_TEXTURE_MAP[data.id];
  if (imgSrc) {
    icon.innerHTML = `<img src="${imgSrc}" alt="${data.name}" class="info-planet-img" />`;
  } else {
    icon.textContent = data.icon || '🌐';
  }
  name.textContent    = data.name.toUpperCase();
  subtitle.textContent = data.info?.type || '';

  grid.innerHTML = '';
  if (data.info) {
    const skip = ['type'];
    const labels = {
      rayon: 'Rayon', masse: 'Masse', distance: 'Distance du Soleil',
      revolution: 'Révolution', rotation: 'Rotation',
      temperature: 'Température', lunes: 'Lunes', gravite: 'Gravité',
      luminosite: 'Luminosité', composition: 'Composition', age: 'Âge',
    };
    for (const [key, val] of Object.entries(data.info)) {
      if (skip.includes(key)) continue;
      const stat = document.createElement('div');
      stat.className = 'info-stat';
      stat.innerHTML = `<div class="info-stat-label">${labels[key] || key}</div>
                        <div class="info-stat-value">${val}</div>`;
      grid.appendChild(stat);
    }
  }

  desc.textContent = data.description || '';
  panel.classList.remove('hidden');
}

export function hideInfoPanel() {
  document.getElementById('info-panel').classList.add('hidden');
}

// ── Focus bar ─────────────────────────────────────────────────────────────────

export function showFocusBar(name) {
  let bar = document.getElementById('focus-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'focus-bar';
    document.body.appendChild(bar);
  }
  bar.textContent = `🎯 Focus : ${name}   [ESC pour libérer]`;
  bar.classList.add('visible');
}

export function hideFocusBar() {
  const bar = document.getElementById('focus-bar');
  if (bar) bar.classList.remove('visible');
}

// ── Labels ────────────────────────────────────────────────────────────────────

export function createLabels() {
  const container = document.getElementById('labels-container');
  container.innerHTML = '';
  const labelMap = {};
  const all = [...PLANETS, ...DWARF_PLANETS, MOON_DATA, { ...SUN_DATA, id: 'soleil' }];
  for (const data of all) {
    const el = document.createElement('div');
    el.className = 'planet-label';
    el.id = `label-${data.id}`;
    el.textContent = data.name.toUpperCase();
    container.appendChild(el);
    labelMap[data.id] = el;
  }
  return labelMap;
}

export function updateLabels(labelMap, bodies, camera, renderer) {
  const width  = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;

  for (const [id, label] of Object.entries(labelMap)) {
    const body = bodies[id];
    if (!body) continue;

    const pos = new THREE.Vector3();
    body.mesh.getWorldPosition(pos);

    // Project to screen
    pos.project(camera);

    const x = (pos.x  *  0.5 + 0.5) * width;
    const y = (-pos.y *  0.5 + 0.5) * height;

    // Hide if behind camera
    if (pos.z > 1) {
      label.style.opacity = '0';
      continue;
    }

    label.style.left = `${x}px`;
    label.style.top  = `${y}px`;
    label.style.opacity = '0.7';
  }
}

// ── Collapsible Panels ────────────────────────────────────────────────────────

export function initCollapsiblePanels() {
  document.querySelectorAll('.collapsible').forEach(panel => {
    const tab = panel.querySelector('.panel-tab');
    if (!tab) return;
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('collapsed');
    });
  });
}

// ── Speed Panel ───────────────────────────────────────────────────────────────

export function initSpeedPanel(onSpeedChange) {
  const slider  = document.getElementById('speed-slider');
  const display = document.getElementById('speed-display');
  const buttons = document.querySelectorAll('.speed-btn');

  function applySpeed(raw) {
    const v = parseFloat(raw);
    // Exponential scale: slider 0–100 → speed 0–50×
    // v=0→0, v=10→1×, v=63→10×, v=100→50×
    const actual = v <= 0 ? 0 : Math.pow(50, (v - 10) / 90);
    const label  = actual < 10 ? actual.toFixed(1) : Math.round(actual);
    display.textContent = `\u00d7${label}`;
    onSpeedChange(actual);
  }

  slider.addEventListener('input', () => applySpeed(slider.value));

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseFloat(btn.dataset.speed);
      slider.value = val;
      applySpeed(val);
    });
  });

  // Initial value
  applySpeed(slider.value);
}

// ── Terminal ──────────────────────────────────────────────────────────────────

const HELP_TEXT = [
  '╔════════════════════════════════════════╗',
  '║        SOLAR EXPLORER — COMMANDES      ║',
  '╠════════════════════════════════════════╣',
  '║  harmonie                              ║',
  '║  heaven                                ║',
  '║  blackhole                             ║',
  '║  help            → Cette aide          ║',
  '║  clear           → Effacer terminal    ║',
  '║  reset           → Vue initiale        ║',
  '║  add/remove orbites  → Orbites          ║',
  '║  vitesse <n>     → Régler la vitesse   ║',
  '║  info <planète>  → Infos détaillées    ║',
  '║  <planète>       → Focus sur la planète║',
  '╚════════════════════════════════════════╝',
];

export function initTerminal({ onGoto, onInfo, onSpeed, onOrbits, onBelt, onReset, onHeaven, onHarmonie, onBlackHole }) {
  const output = document.getElementById('terminal-output');
  const input  = document.getElementById('terminal-input');
  const prompt = document.getElementById('terminal-prompt');
  const aliasMap = buildAliasMap();
  const history = [];
  let histIdx = -1;

  // Sync prompt blink with input focus
  input.addEventListener('focus', () => {
    prompt.style.animation = 'none';
    prompt.style.opacity   = '1';
  });
  input.addEventListener('blur', () => {
    prompt.style.animation = '';
    prompt.style.opacity   = '';
  });

  function print(text, cls = 'output') {
    const lines = Array.isArray(text) ? text : [text];
    for (const line of lines) {
      const div = document.createElement('div');
      div.className = `term-line ${cls}`;
      div.textContent = line;
      output.appendChild(div);
    }
    output.scrollTop = output.scrollHeight;
  }

  function normalize(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function resolveBody(raw) {
    const n = normalize(raw);
    return aliasMap[n] || null;
  }

  function getBodyData(id) {
    if (id === 'soleil') return SUN_DATA;
    if (id === 'lune')   return MOON_DATA;
    return PLANETS.find(p => p.id === id) || null;
  }

  function execute(raw) {
    const cmd = raw.trim();
    if (!cmd) return;

    history.unshift(cmd);
    histIdx = -1;
    print(`> ${cmd}`, 'input');

    const parts   = cmd.split(/\s+/);
    const verb    = normalize(parts[0]);
    const rest    = parts.slice(1).join(' ');

    // ── Commands ──────────────────────────────────────────────────────────
    if (verb === 'help' || verb === 'aide') {
      print(HELP_TEXT, 'system');
      return;
    }

    if (verb === 'clear' || verb === 'cls') {
      output.innerHTML = '';
      return;
    }

    if (verb === 'reset') {
      onReset();
      print('Vue réinitialisée.', 'output');
      return;
    }

    if (verb === 'vitesse' || verb === 'speed') {
      const n = parseFloat(rest);
      if (isNaN(n) || n < 0 || n > 50) {
        print('Valeur entre 0 et 50 (ex: vitesse 5)', 'error');
        return;
      }
      onSpeed(n);
      const slider = document.getElementById('speed-slider');
      if (slider) {
        const sv = n <= 0 ? 0 : Math.round(10 + 90 * Math.log(n) / Math.log(50));
        slider.value = Math.max(0, Math.min(100, sv));
      }
      const display = document.getElementById('speed-display');
      const lbl = n < 10 ? n.toFixed(1) : Math.round(n);
      if (display) display.textContent = `\u00d7${lbl}`;
      print(`Vitesse r\u00e9gl\u00e9e \u00e0 ${lbl}\u00d7`, 'output');
      return;
    }

    if (verb === 'add' || verb === 'remove') {
      const target = normalize(rest);
      const on = verb === 'add';
      if (target === 'orbites' || target === 'orbits') {
        onOrbits(on);
        print(`Orbites ${on ? 'affichées' : 'masquées'}.`, 'output');
        return;
      }
      print(`Cible inconnue. Essayez: add/remove orbites`, 'error');
      return;
    }

    if (verb === 'orbites' || verb === 'orbits') {
      const state = normalize(rest) === 'on' || normalize(rest) === 'true';
      onOrbits(state);
      print(`Orbites ${state ? 'affichées' : 'masquées'}.`, 'output');
      return;
    }

    if (verb === 'info') {
      const id = resolveBody(rest || parts[1] || '');
      if (!id) { print(`Corps inconnu : "${rest}"`, 'error'); return; }
      const data = getBodyData(id);
      if (data) {
        onInfo(id);
        print(`Infos sur ${data.name} affichées.`, 'output');
      }
      return;
    }

    // ── Secret commands ────────────────────────────────────────────────────
    if (verb === 'heaven') {
      if (onHeaven) onHeaven();
      return;
    }

    if (verb === 'harmonie') {
      if (onHarmonie) {
        onHarmonie();
        print('Signal reçu... Un vaisseau approche du système solaire.', 'info');
      }
      return;
    }

    if (verb === 'blackhole') {
      if (onBlackHole) onBlackHole();
      return;
    }

    // Single-word shortcut: treat as body name
    const id = resolveBody(cmd);
    if (id) {
      const data = getBodyData(id);
      onGoto(id);
      print(`Navigation vers ${data?.name || id}…`, 'output');
      return;
    }

    print(`Commande inconnue : "${cmd}". Tapez "help" pour l'aide.`, 'error');
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      execute(input.value);
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      if (histIdx < history.length - 1) histIdx++;
      input.value = history[histIdx] || '';
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (histIdx > 0) histIdx--;
      input.value = histIdx >= 0 ? history[histIdx] : '';
      e.preventDefault();
    }
  });

  // Click terminal header to focus input
  document.getElementById('terminal-header')?.addEventListener('click', () => input.focus());

  return { print };
}

