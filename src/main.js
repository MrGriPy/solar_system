import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSolarSystem, tickSolarSystem, getBodyWorldPosition } from './solarSystem.js';
import { PLANETS, SUN_DATA, MOON_DATA, DWARF_PLANETS } from './planetData.js';
import {
  showInfoPanel, hideInfoPanel,
  showFocusBar, hideFocusBar,
  createLabels, updateLabels,
  initSpeedPanel, initTerminal,
} from './ui.js';
import { initHeaven } from './bigbang.js';
import { initHarmonie } from './harmonie.js';
import { initBlackHole } from './blackhole.js';

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;

// ── Scene & Camera ────────────────────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x020408);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 80, 180);
camera.lookAt(0, 0, 0);

// ── Controls ──────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, canvas);
controls.enableDamping    = true;
controls.dampingFactor    = 0.06;
controls.screenSpacePanning = false;
controls.minDistance      = 3;
controls.maxDistance      = 700;
controls.zoomSpeed        = 1.2;
controls.rotateSpeed      = 0.6;
controls.panSpeed         = 0.8;

const MAX_PAN_RADIUS = 350;

// ── Solar System ──────────────────────────────────────────────────────────────
const { bodies, belt, kuiperBelt, sunLight, ambientLight } = buildSolarSystem(scene);

// ── Heaven (Made in Heaven easter egg) ────────────────────────────────────────
const heaven = initHeaven(scene, bodies, belt, kuiperBelt);

// ── Black Hole sequence ───────────────────────────────────────────────────────
const blackHole = initBlackHole(scene, bodies, belt, kuiperBelt, sunLight, ambientLight);

// ── Harmonie (Vaisseau Comète de Mario Galaxy) ─────────────────────────────────
const harmonie = initHarmonie(scene, bodies);

// ── Labels ────────────────────────────────────────────────────────────────────
const labelMap = createLabels();

// ── State ─────────────────────────────────────────────────────────────────────
let speedFactor   = 1.0;
let focusedBody   = null;
let showOrbits    = true;
let showBelt      = true;
let isFollowing   = false;

// Camera animation
const camState = {
  animating: false,
  startPos:  new THREE.Vector3(),
  startTarget: new THREE.Vector3(),
  endPos:    new THREE.Vector3(),
  endTarget: new THREE.Vector3(),
  t:         0,
  duration:  1.2, // seconds
};

// ── Raycaster for clicks ──────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

function getClickableMeshes() {
  const meshes = Object.values(bodies).map(b => b.mesh);
  const hm = harmonie.getClickMesh();
  if (hm && !heaven.isActive()) meshes.push(hm);
  return meshes;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  // short click detection
  canvas._pointerDownTime = Date.now();
  canvas._pointerDownPos  = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return;
  const dt   = Date.now() - (canvas._pointerDownTime || 0);
  const dx   = e.clientX - (canvas._pointerDownPos?.x || 0);
  const dy   = e.clientY - (canvas._pointerDownPos?.y || 0);
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dt > 300 || dist > 5) return; // not a click

  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const hits = raycaster.intersectObjects(getClickableMeshes(), false);
  if (hits.length > 0) {
    const mesh = hits[0].object;
    const id   = mesh.userData?.id;
    if (id === 'harmonie' && !heaven.isActive()) { harmonie.openStory(); return; }
    if (id) focusOnBody(id, true);
  }
});

// ── Focus / Camera animation ──────────────────────────────────────────────────

function getBodyData(id) {
  if (id === 'soleil') return SUN_DATA;
  if (id === 'lune')   return MOON_DATA;
  return PLANETS.find(p => p.id === id) || DWARF_PLANETS.find(p => p.id === id) || null;
}

function focusOnBody(id, showInfo = false) {
  const body = bodies[id];
  if (!body) return;
  const data = getBodyData(id);

  focusedBody = id;
  isFollowing = true;

  const worldPos = getBodyWorldPosition(body);
  const r        = data.radius * 5 + 4;

  camState.startPos.copy(camera.position);
  camState.startTarget.copy(controls.target);
  camState.endTarget.copy(worldPos);

  // Offset camera above and to the side
  const dir = camera.position.clone().sub(worldPos);
  if (dir.length() < 0.01) dir.set(0.5, 0.3, 1);
  dir.normalize();
  camState.endPos.copy(worldPos).addScaledVector(dir, r);
  camState.endPos.y = worldPos.y + r * 0.4;

  camState.t = 0;
  camState.animating = true;

  showFocusBar(data?.name || id);

  if (showInfo && data) {
    showInfoPanel(data);
  }
}

function releaseFocus() {
  focusedBody   = null;
  isFollowing   = false;
  hideFocusBar();
}

function resetView() {
  releaseFocus();
  hideInfoPanel();
  camState.startPos.copy(camera.position);
  camState.startTarget.copy(controls.target);
  camState.endPos.set(0, 80, 180);
  camState.endTarget.set(0, 0, 0);
  camState.t = 0;
  camState.animating = true;
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const terminalFocused = document.activeElement === document.getElementById('terminal-input');
  if (e.key === 'Escape') {
    if (!document.getElementById('info-panel').classList.contains('hidden')) {
      hideInfoPanel();
    } else if (!terminalFocused) {
      releaseFocus();
    }
  }
  if (terminalFocused) return;
  // Number keys 1–9 for quick planet focus
  const numMap = ['soleil','mercure','venus','terre','mars','jupiter','saturne','uranus','neptune'];
  if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
    const idx = parseInt(e.key) - 1;
    if (numMap[idx]) focusOnBody(numMap[idx], false);
  }
  if (e.key === '0') resetView();
});

// ── Info panel close ──────────────────────────────────────────────────────────
document.getElementById('info-close').addEventListener('click', () => {
  hideInfoPanel();
  releaseFocus();
});

// ── Speed Panel ───────────────────────────────────────────────────────────────
initSpeedPanel((v) => { speedFactor = v; });

// ── Terminal ──────────────────────────────────────────────────────────────────
const term = initTerminal({
  onGoto:   (id) => focusOnBody(id, false),
  onInfo:   (id) => {
    const d = getBodyData(id);
    if (d) showInfoPanel(d);
  },
  onSpeed:  (v)  => { speedFactor = v; },
  onOrbits: (v)  => toggleOrbits(v),
  onBelt:   (v)  => toggleBelt(v),
  onReset:  ()   => resetView(),
  onHeaven:    ()   => heaven.trigger(),
  onHarmonie:  ()   => harmonie.trigger(),
  onBlackHole: ()   => blackHole.trigger(),
});

// ── Orbit lines toggle ────────────────────────────────────────────────────────
function toggleOrbits(state) {
  showOrbits = state;
  for (const body of Object.values(bodies)) {
    if (body.orbitLine) body.orbitLine.visible = state;
  }
}

function toggleBelt(state) {
  showBelt = state;
  if (belt?.group) belt.group.visible = state;
}


// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Clock ─────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

// ── Ease function ─────────────────────────────────────────────────────────────
function easeInOut(t) {
  return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // Clamp pan target so the user can't drift infinitely away
  if (controls.target.length() > MAX_PAN_RADIUS) {
    controls.target.clampLength(0, MAX_PAN_RADIUS);
  }

  // Tick simulation — heaven overrides speedFactor when active
  const heavenSpeed = heaven.tick(delta);
  const effectiveSpeed = heavenSpeed !== null ? heavenSpeed : speedFactor;
  tickSolarSystem(bodies, belt, delta * 6, effectiveSpeed, kuiperBelt);

  // Tick Harmonie animation
  harmonie.tick(delta);

  // Tick Black Hole sequence
  blackHole.tick(delta);

  // Camera animation
  if (camState.animating) {
    camState.t += delta / camState.duration;
    if (camState.t >= 1) {
      camState.t = 1;
      camState.animating = false;
    }
    const e = easeInOut(camState.t);
    camera.position.lerpVectors(camState.startPos, camState.endPos, e);
    controls.target.lerpVectors(camState.startTarget, camState.endTarget, e);
  }

  // Follow focused body
  if (isFollowing && focusedBody && !camState.animating) {
    const body    = bodies[focusedBody];
    if (body) {
      const worldPos = getBodyWorldPosition(body);
      const offset   = camera.position.clone().sub(controls.target);
      controls.target.copy(worldPos);
      camera.position.copy(worldPos).add(offset);
    }
  }

  controls.update();

  // Black hole camera shake (applied after controls.update so it isn't overridden)
  const bhShake = blackHole.getShake();
  if (bhShake > 0) {
    const et = clock.elapsedTime;
    camera.position.x += Math.sin(et * 47.3 + 1.1) * bhShake;
    camera.position.y += Math.sin(et * 61.7 + 2.3) * bhShake;
    camera.position.z += Math.sin(et * 53.9 + 0.7) * bhShake;
  }

  // Update labels
  updateLabels(labelMap, bodies, camera, renderer);

  renderer.render(scene, camera);
}

// ── Loading screen ────────────────────────────────────────────────────────────
function showLoading() {
  const el = document.createElement('div');
  el.id = 'loading';
  el.innerHTML = `
    <div class="loading-title">SYSTÈME SOLAIRE</div>
    <div class="loading-bar-wrap"><div class="loading-bar"></div></div>
    <div class="loading-text">Initialisation de la scène 3D…</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 900);
  }, 1300);
}

showLoading();
animate();
