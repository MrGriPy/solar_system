import * as THREE from 'three';

// ── Galaxy Collapse — Mario Galaxy Bowser's Galaxy Reactor ──────────────────
// Faithful recreation of the end cutscene where Bowser's galaxy implodes
// Phase 0  [0–6s]    DESTABILISATION  dark energy awakens, gravity shifts
// Phase 1  [6–24s]   EFFONDREMENT     spiral collapse, everything pulled inward
// Phase 2  [24–36s]  IMPLOSION        singularity crush, particles absorbed
// Phase 3  [36–42s]  FLASH            white flash + instant restoration
// Phase 4  [42–50s]  LUMA FADEOUT     Luma particles dissipate
// ────────────────────────────────────────────────────────────────────────────

const STAR_N   = 22000;
const DEBRIS_N = 9000;
const LUMA_N   = 6000;
const TOTAL    = 50;

let bhState = null;

export function initBlackHole(scene, bodies, belt, kuiperBelt, sunLight, ambientLight) {
  return {
    trigger()   { if (!bhState) _start(scene, bodies, belt, kuiperBelt, sunLight, ambientLight); },
    tick(delta) { if (bhState) _tick(delta); },
    isActive()  { return !!bhState; },
    getShake()  { return bhState?.shakeAmp ?? 0; },
  };
}

// ── Internal start ────────────────────────────────────────────────────────────

function _start(scene, bodies, belt, kuiperBelt, sunLight, ambientLight) {

  // ── Snapshot planet transforms (mesh.position is in pivot-local space) ─────
  const bodySnaps = Object.values(bodies).map(b => ({
    mesh:     b.mesh,
    localPos: b.mesh.position.clone(),
    scale:    b.mesh.scale.clone(),
  }));

  // ── Snapshot orbit lines for fade ──────────────────────────────────────────
  const orbitSnaps = [];
  for (const b of Object.values(bodies)) {
    if (b.orbitLine) {
      orbitSnaps.push({
        line: b.orbitLine,
        origOpacity: b.orbitLine.material.opacity,
        origVisible: b.orbitLine.visible,
      });
    }
  }

  // ── Labels container ───────────────────────────────────────────────────────
  const labelsContainer = document.getElementById('labels-container');

  // ── Snapshot belt groups for animation (NOT hidden immediately) ────────────
  const beltSnap = belt?.group ? {
    group: belt.group,
    origScale: belt.group.scale.clone(),
  } : null;
  const kuiperSnap = kuiperBelt?.group ? {
    group: kuiperBelt.group,
    origScale: kuiperBelt.group.scale.clone(),
  } : null;

  // ── Dark void core (gravitational singularity) ────────────────────────────
  const voidMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x050010 })
  );
  voidMesh.scale.setScalar(0.01);
  scene.add(voidMesh);

  // ── Glow shell — dark purple energy aura ──────────────────────────────────
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x6622aa, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  });
  const glowMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), glowMat);
  glowMesh.scale.setScalar(0.01);
  scene.add(glowMesh);

  // ── Energy rings — dark pulsating tori (5) ────────────────────────────────
  const energyRings = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.72 + i * 0.04, 0.85, 0.5),
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.04, 8, 96), mat);
    mesh.scale.setScalar(0.01);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    scene.add(mesh);
    energyRings.push({ mesh, mat, baseRotSpeed: 0.4 + i * 0.25 });
  }

  // ── Shockwave ring pool (10 rings) ────────────────────────────────────────
  const shockwaves = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x8844dd, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 80), mat);
    mesh.visible = false;
    scene.add(mesh);
    shockwaves.push({ mesh, mat, r: 1, speed: 0, life: 0, maxLife: 3 });
  }

  // ── Collapsing star particles (22 000) ────────────────────────────────────
  const sPos  = new Float32Array(STAR_N * 3);
  const sCol  = new Float32Array(STAR_N * 3);
  const sData = [];
  for (let i = 0; i < STAR_N; i++) {
    const r     = 20 + Math.random() * 350;
    const theta = Math.random() * Math.PI * 2;
    const phi   = (Math.random() - 0.5) * Math.PI * 0.9;
    const y     = Math.sin(phi) * r * 0.5;
    sPos[i*3]   = Math.cos(theta) * r * Math.cos(phi);
    sPos[i*3+1] = y;
    sPos[i*3+2] = Math.sin(theta) * r * Math.cos(phi);
    const pick = Math.random();
    let cr, cg, cb;
    if (pick < 0.25)      { cr = 0.6 + Math.random() * 0.4; cg = 0.7 + Math.random() * 0.3; cb = 1.0; }
    else if (pick < 0.40) { cr = 0.7 + Math.random() * 0.3; cg = 0.3 + Math.random() * 0.3; cb = 1.0; }
    else if (pick < 0.60) { cr = 1.0; cg = 0.85 + Math.random() * 0.15; cb = 0.4 + Math.random() * 0.3; }
    else if (pick < 0.80) { cr = 1.0; cg = 0.5 + Math.random() * 0.3; cb = 0.2 + Math.random() * 0.2; }
    else { const w = 0.8 + Math.random() * 0.2; cr = w; cg = w; cb = w; }
    sCol[i*3] = cr; sCol[i*3+1] = cg; sCol[i*3+2] = cb;
    sData.push({ r, theta, phi, y,
      omega:  0.12 + Math.random() * 0.55,
      infall: 0.015 + Math.random() * 0.055,
      yDamp:  0.012 + Math.random() * 0.02,
      alive:  true,
    });
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('color',    new THREE.BufferAttribute(sCol, 3));
  const sMat = new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sPoints = new THREE.Points(sGeo, sMat);
  scene.add(sPoints);

  // ── Debris particles (9 000) ──────────────────────────────────────────────
  const dbPos  = new Float32Array(DEBRIS_N * 3);
  const dbCol  = new Float32Array(DEBRIS_N * 3);
  const dbData = [];
  for (let i = 0; i < DEBRIS_N; i++) {
    const r     = 8 + Math.random() * 200;
    const theta = Math.random() * Math.PI * 2;
    const y     = (Math.random() - 0.5) * 50;
    dbPos[i*3]   = Math.cos(theta) * r;
    dbPos[i*3+1] = y;
    dbPos[i*3+2] = Math.sin(theta) * r;
    const b = 0.25 + Math.random() * 0.5;
    dbCol[i*3] = b * 1.2; dbCol[i*3+1] = b * 0.85; dbCol[i*3+2] = b * 0.65;
    dbData.push({ r, theta, y,
      omega:  0.25 + Math.random() * 0.9,
      infall: 0.035 + Math.random() * 0.12,
      alive:  true,
    });
  }
  const dbGeo = new THREE.BufferGeometry();
  dbGeo.setAttribute('position', new THREE.BufferAttribute(dbPos, 3));
  dbGeo.setAttribute('color',    new THREE.BufferAttribute(dbCol, 3));
  const dbMat = new THREE.PointsMaterial({
    size: 0.3, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const dbPoints = new THREE.Points(dbGeo, dbMat);
  scene.add(dbPoints);

  // ── Luma rebirth particles (6 000 — Mario Galaxy colors) ──────────────────
  const lPos  = new Float32Array(LUMA_N * 3);
  const lCol  = new Float32Array(LUMA_N * 3);
  const lData = [];
  const lumaColors = [
    [1.0, 1.0, 0.4], [0.4, 0.6, 1.0], [0.4, 1.0, 0.5],
    [1.0, 0.5, 0.7], [1.0, 1.0, 1.0], [1.0, 0.8, 0.2],
    [0.6, 0.4, 1.0], [0.3, 1.0, 1.0],
  ];
  for (let i = 0; i < LUMA_N; i++) {
    lPos[i*3] = 0; lPos[i*3+1] = 0; lPos[i*3+2] = 0;
    const col = lumaColors[Math.floor(Math.random() * lumaColors.length)];
    lCol[i*3] = col[0]; lCol[i*3+1] = col[1]; lCol[i*3+2] = col[2];
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const speed = 12 + Math.random() * 80;
    lData.push({
      vx: Math.sin(phi) * Math.cos(theta) * speed,
      vy: Math.sin(phi) * Math.sin(theta) * speed,
      vz: Math.cos(phi) * speed,
      drag: 0.965 + Math.random() * 0.03,
    });
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
  lGeo.setAttribute('color',    new THREE.BufferAttribute(lCol, 3));
  const lMat = new THREE.PointsMaterial({
    size: 0.65, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lPoints = new THREE.Points(lGeo, lMat);
  scene.add(lPoints);

  // ── Full-screen flash div ──────────────────────────────────────────────────
  const flashEl = document.createElement('div');
  Object.assign(flashEl.style, {
    position: 'fixed', inset: '0', background: 'white',
    opacity: '0', pointerEvents: 'none', zIndex: '9998', transition: 'none',
  });
  document.body.appendChild(flashEl);

  // ── Darkness overlay (for the silence moment) ─────────────────────────────
  const darkEl = document.createElement('div');
  Object.assign(darkEl.style, {
    position: 'fixed', inset: '0', background: '#050010',
    opacity: '0', pointerEvents: 'none', zIndex: '9997', transition: 'none',
  });
  document.body.appendChild(darkEl);

  bhState = {
    t: 0,
    scene, bodies, bodySnaps,
    orbitSnaps, labelsContainer,
    beltSnap, kuiperSnap, belt, kuiperBelt,
    voidMesh, glowMesh, glowMat,
    energyRings, shockwaves,
    sPoints, sGeo, sMat, sData, sPos,
    dbPoints, dbGeo, dbMat, dbData, dbPos,
    lPoints, lGeo, lMat, lData, lPos,
    flashEl, darkEl,
    sunLight, ambientLight,
    origSun: sunLight.intensity,
    origAmb: ambientLight.intensity,
    shakeAmp: 0,
    swTimer: 0,
    noRespawn: false,
    done: false,
  };
}

// ── Main tick ─────────────────────────────────────────────────────────────────

function _tick(delta) {
  const s = bhState;
  if (s.done) return;
  s.t += delta;
  const t = s.t;

  if      (t < 6)  _phase0(s, t, delta);
  else if (t < 24) _phase1(s, t - 6,  delta);
  else if (t < 36) _phase2(s, t - 24, delta);
  else if (t < 42) _phase3(s, t - 36, delta);
  else if (t < 50) _phase4(s, t - 42, delta);
  else             { _cleanup(s); return; }

  // Energy rings spin
  for (const ring of s.energyRings) {
    ring.mesh.rotation.x += delta * ring.baseRotSpeed;
    ring.mesh.rotation.y += delta * ring.baseRotSpeed * 0.7;
  }

  // Shockwave pool update
  for (const sw of s.shockwaves) {
    if (sw.life <= 0) continue;
    sw.life -= delta;
    sw.r    += sw.speed * delta;
    sw.mesh.scale.setScalar(sw.r);
    sw.mat.opacity = Math.max(0, sw.life / sw.maxLife) * 0.65;
    if (sw.life <= 0) sw.mesh.visible = false;
  }
}

// ── Phase 0 [0–6s]: Destabilisation ─────────────────────────────────────────

function _phase0(s, t, delta) {
  const p = t / 6;

  const voidR = _easeOut(Math.min(t / 3, 1)) * 5;
  _setVoid(s, voidR, 0.1 + 0.06 * Math.sin(t * 4));

  s.sMat.opacity = _easeOut(p) * 0.35;
  _animStars(s, delta, p * 0.2, p * 0.3);

  _fadeOrbitsAndLabels(s, 1 - _easeOut(p));
  _animBelts(s, delta, p * 0.5, 0);

  s.sunLight.intensity    = s.origSun * (1 - p * 0.3);
  s.ambientLight.intensity = s.origAmb * (1 - p * 0.2);
  s.shakeAmp = p * 0.025;

  if (t > 2.5 && t < 2.55) _emitShockwave(s, voidR * 1.2, 14, 2.5, 0.78, 0.8, 0.6);
  if (t > 4.5 && t < 4.55) _emitShockwave(s, voidR * 1.0, 10, 2.0, 0.72, 0.9, 0.55);
}

// ── Phase 1 [6–24s]: Effondrement spirale ───────────────────────────────────

function _phase1(s, t, delta) {
  const p = t / 18;

  const voidR = 5 + _easeOut(p) * 20;
  const hue   = 0.78 - p * 0.08;
  _setVoid(s, voidR, 0.15 + 0.08 * Math.sin(t * 3));
  s.glowMat.color.setHSL(hue, 0.9, 0.4);

  s.sMat.opacity = 0.35 + p * 0.5;
  _animStars(s, delta, 0.2 + p * 3.5, 0.3 + p * 1.8);

  s.dbMat.opacity = _easeOut(Math.max(0, (p - 0.1) / 0.9)) * 0.6;
  _animDebris(s, delta, 0.3 + p * 3.0, 0.4 + p * 1.5);

  for (const ring of s.energyRings) {
    ring.mat.opacity = 0.2 + p * 0.45 + 0.12 * Math.sin(t * 4 + ring.baseRotSpeed);
    ring.mesh.scale.setScalar(voidR * (1.2 + ring.baseRotSpeed * 0.3));
  }

  s.sunLight.intensity    = s.origSun * (0.7 - p * 0.6);
  s.ambientLight.intensity = s.origAmb * (0.8 - p * 0.65);
  s.shakeAmp = 0.025 + p * 0.14;

  _pullBodies(s, p * 0.5);
  _animBelts(s, delta, 0.5 + p * 4, p * 0.7);
  _fadeOrbitsAndLabels(s, 0);

  s.swTimer -= delta;
  if (s.swTimer <= 0) {
    _emitShockwave(s, voidR * 1.1, 8 + p * 18, 2.2, 0.75 - p * 0.05, 0.8, 0.5);
    s.swTimer = 2.5 - p * 1.8;
  }
}

// ── Phase 2 [24–36s]: Implosion ─────────────────────────────────────────────

function _phase2(s, t, delta) {
  const p = t / 12;

  // After 15 % of implosion, particles stop respawning — truly absorbed
  if (p > 0.15) s.noRespawn = true;

  let voidR;
  if (p < 0.5) {
    voidR = 25 + _easeOut(p / 0.5) * 30;
  } else {
    voidR = 55 * (1 - _easeIn((p - 0.5) / 0.5));
  }
  voidR = Math.max(voidR, 0.05);
  _setVoid(s, voidR, Math.min(0.45, 0.2 + p * 0.35));

  s.sMat.opacity = Math.max(0, 0.85 - p * 1.1);
  _animStars(s, delta, 3.5 + p * 8, 2.0 + p * 4);

  s.dbMat.opacity = Math.max(0, 0.6 - p * 0.8);
  _animDebris(s, delta, 3.0 + p * 6, 1.8 + p * 3.5);

  for (const ring of s.energyRings) {
    ring.mat.opacity = Math.max(0, 0.65 - p * 0.85);
    ring.mesh.scale.setScalar(Math.max(0.01, voidR * 1.2));
  }

  if (p > 0.55) {
    const dp = (p - 0.55) / 0.45;
    s.darkEl.style.opacity = (_easeIn(dp) * 0.9).toFixed(3);
  }

  s.sunLight.intensity    = s.origSun * Math.max(0, 0.1 - p * 0.12);
  s.ambientLight.intensity = s.origAmb * Math.max(0, 0.15 - p * 0.18);
  s.shakeAmp = p < 0.65 ? 0.14 + p * 0.3 : Math.max(0, 0.34 - (p - 0.65) * 0.9);

  _pullBodies(s, 0.5 + p * 0.5);
  _animBelts(s, delta, 4.5 + p * 8, 0.7 + p * 0.3);
  _fadeOrbitsAndLabels(s, 0);

  s.swTimer -= delta;
  if (s.swTimer <= 0) {
    _emitShockwave(s, voidR * 0.9, 12 + p * 20, 1.8, 0.7, 0.85, 0.55);
    s.swTimer = 1.5 - p * 1.0;
  }
}

// ── Phase 3 [36–42s]: Flash & instant restoration ──────────────────────────

function _phase3(s, t, delta) {
  const p = t / 6;

  s.voidMesh.scale.setScalar(0.001);
  s.glowMesh.scale.setScalar(0.001);
  for (const ring of s.energyRings) ring.mesh.visible = false;
  s.sMat.opacity  = 0;
  s.dbMat.opacity = 0;

  // ── Flash envelope ────────────────────────────────────────────────────────
  if (p < 0.2) {
    const fp = p / 0.2;
    s.flashEl.style.opacity = _easeOut(fp).toFixed(3);
    s.darkEl.style.opacity  = (0.9 * (1 - fp)).toFixed(3);
  } else if (p < 0.45) {
    s.flashEl.style.opacity = '1';
    s.darkEl.style.opacity  = '0';
  } else {
    const fp = (p - 0.45) / 0.55;
    s.flashEl.style.opacity = (1 - _easeOut(fp)).toFixed(3);
  }

  // ── Restore everything while screen is white (p ≥ 0.25) ──────────────────
  if (p < 0.25) {
    if (s.beltSnap)   s.beltSnap.group.visible = false;
    if (s.kuiperSnap) s.kuiperSnap.group.visible = false;
    _fadeOrbitsAndLabels(s, 0);
    s.sunLight.intensity    = s.origSun * _easeOut(p / 0.25) * 0.3;
    s.ambientLight.intensity = s.origAmb * _easeOut(p / 0.25) * 0.4;
  } else {
    _restoreBodies(s, 1);
    _restoreBelts(s, 1);
    _fadeOrbitsAndLabels(s, 1);
    s.sunLight.intensity    = s.origSun;
    s.ambientLight.intensity = s.origAmb;
  }

  s.lMat.opacity = _easeOut(Math.min(p / 0.3, 1)) * 0.95;
  _animLumas(s, delta);

  s.shakeAmp = Math.max(0, 0.18 - p * 0.35);

  s.swTimer -= delta;
  if (s.swTimer <= 0) {
    const hue = Math.random() * 0.35 + 0.08;
    _emitShockwave(s, 1, 35 + p * 50, 2.8, hue, 1, 0.85);
    s.swTimer = 0.4 + Math.random() * 0.3;
  }
}

// ── Phase 4 [42–50s]: Luma fadeout (everything already normal) ──────────────

function _phase4(s, t, delta) {
  const p = t / 8;

  s.voidMesh.scale.setScalar(0.001);
  s.glowMesh.scale.setScalar(0.001);
  for (const ring of s.energyRings) ring.mesh.visible = false;
  s.sMat.opacity  = 0;
  s.dbMat.opacity = 0;
  s.flashEl.style.opacity = '0';
  s.darkEl.style.opacity  = '0';

  // Everything already restored — just fade out Lumas
  s.lMat.opacity = Math.max(0, 0.95 * (1 - _easeIn(p)));
  _animLumas(s, delta);

  s.sunLight.intensity    = s.origSun;
  s.ambientLight.intensity = s.origAmb;
  s.shakeAmp = 0;

  _restoreBodies(s, 1);
  _restoreBelts(s, 1);
  _fadeOrbitsAndLabels(s, 1);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

function _cleanup(s) {
  s.done = true;
  for (const obj of [s.voidMesh, s.glowMesh, s.sPoints, s.dbPoints, s.lPoints]) {
    s.scene.remove(obj);
    obj.geometry?.dispose();
  }
  for (const ring of s.energyRings) { s.scene.remove(ring.mesh); ring.mesh.geometry?.dispose(); }
  for (const sw of s.shockwaves)    { s.scene.remove(sw.mesh);   sw.mesh.geometry?.dispose(); }
  s.flashEl.remove();
  s.darkEl.remove();
  s.sunLight.intensity    = s.origSun;
  s.ambientLight.intensity = s.origAmb;
  _restoreBelts(s, 1);
  _fadeOrbitsAndLabels(s, 1);
  _restoreBodies(s, 1);
  s.shakeAmp = 0;
  bhState = null;
}

// ── Void visual helper ──────────────────────────────────────────────────────

function _setVoid(s, r, glowOpacity) {
  s.voidMesh.scale.setScalar(r);
  s.voidMesh.visible = true;
  s.glowMesh.scale.setScalar(r * 2.2);
  s.glowMesh.visible = true;
  s.glowMat.opacity = glowOpacity;
  for (const ring of s.energyRings) ring.mesh.visible = true;
}

// ── Fade orbits and labels ──────────────────────────────────────────────────

function _fadeOrbitsAndLabels(s, factor) {
  const f = Math.max(0, Math.min(1, factor));
  if (s.labelsContainer) s.labelsContainer.style.opacity = f.toFixed(3);
  for (const snap of s.orbitSnaps) {
    snap.line.material.opacity = snap.origOpacity * f;
    snap.line.visible = f > 0.01 && snap.origVisible;
  }
}

// ── Belt animation: spin faster + scale down toward center ──────────────────

function _animBelts(s, delta, spinMult, shrink) {
  if (s.beltSnap) {
    s.beltSnap.group.rotation.y += 0.005 * spinMult * delta;
    const sc = Math.max(0.001, 1 - shrink);
    s.beltSnap.group.scale.copy(s.beltSnap.origScale).multiplyScalar(sc);
  }
  if (s.kuiperSnap) {
    s.kuiperSnap.group.rotation.y += 0.003 * spinMult * delta;
    const sc = Math.max(0.001, 1 - shrink);
    s.kuiperSnap.group.scale.copy(s.kuiperSnap.origScale).multiplyScalar(sc);
  }
}

// ── Belt restoration ────────────────────────────────────────────────────────

function _restoreBelts(s, p) {
  const pp = Math.min(Math.max(p, 0), 1);
  if (s.beltSnap) {
    s.beltSnap.group.visible = pp > 0.01;
    s.beltSnap.group.scale.copy(s.beltSnap.origScale).multiplyScalar(pp);
  }
  if (s.kuiperSnap) {
    s.kuiperSnap.group.visible = pp > 0.01;
    s.kuiperSnap.group.scale.copy(s.kuiperSnap.origScale).multiplyScalar(pp);
  }
}

// ── Star collapse animation (respawn disabled when noRespawn=true) ──────────

function _animStars(s, delta, omegaMult, infallMult) {
  const pos = s.sPos; const data = s.sData;
  for (let i = 0; i < STAR_N; i++) {
    const d = data[i];
    if (!d.alive) continue;
    d.theta += d.omega * omegaMult * delta;
    d.r     -= d.infall * infallMult * delta * (250 / Math.max(d.r, 2));
    d.y     *= (1 - d.yDamp * infallMult * delta);
    if (d.r < 2) {
      if (s.noRespawn) {
        d.alive = false;
        pos[i*3] = 0; pos[i*3+1] = 0; pos[i*3+2] = 0;
        continue;
      }
      d.r     = 25 + Math.random() * 300;
      d.theta = Math.random() * Math.PI * 2;
      d.y     = (Math.random() - 0.5) * 70;
    }
    pos[i*3]   = Math.cos(d.theta) * d.r;
    pos[i*3+1] = d.y;
    pos[i*3+2] = Math.sin(d.theta) * d.r;
  }
  s.sGeo.attributes.position.needsUpdate = true;
}

// ── Debris animation (respawn disabled when noRespawn=true) ─────────────────

function _animDebris(s, delta, omegaMult, infallMult) {
  const pos = s.dbPos; const data = s.dbData;
  for (let i = 0; i < DEBRIS_N; i++) {
    const d = data[i];
    if (!d.alive) continue;
    d.theta += d.omega * omegaMult * delta;
    d.r     -= d.infall * infallMult * delta * (150 / Math.max(d.r, 2));
    d.y     *= (1 - 0.02 * infallMult * delta);
    if (d.r < 1.5) {
      if (s.noRespawn) {
        d.alive = false;
        pos[i*3] = 0; pos[i*3+1] = 0; pos[i*3+2] = 0;
        continue;
      }
      d.r     = 12 + Math.random() * 160;
      d.theta = Math.random() * Math.PI * 2;
      d.y     = (Math.random() - 0.5) * 40;
    }
    pos[i*3]   = Math.cos(d.theta) * d.r;
    pos[i*3+1] = d.y;
    pos[i*3+2] = Math.sin(d.theta) * d.r;
  }
  s.dbGeo.attributes.position.needsUpdate = true;
}

// ── Luma burst animation ────────────────────────────────────────────────────

function _animLumas(s, delta) {
  const pos = s.lPos; const data = s.lData;
  for (let i = 0; i < LUMA_N; i++) {
    const d = data[i];
    pos[i*3]   += d.vx * delta;
    pos[i*3+1] += d.vy * delta;
    pos[i*3+2] += d.vz * delta;
    d.vx *= d.drag;
    d.vy *= d.drag;
    d.vz *= d.drag;
  }
  s.lGeo.attributes.position.needsUpdate = true;
}

// ── Body pull / restore ───────────────────────────────────────────────────────

const _zero = new THREE.Vector3(0, 0, 0);

function _pullBodies(s, strength) {
  for (const snap of s.bodySnaps) {
    snap.mesh.position.lerpVectors(snap.localPos, _zero, Math.min(strength, 1));
    const sc = Math.max(0.001, 1 - strength * 0.98);
    snap.mesh.scale.copy(snap.scale).multiplyScalar(sc);
  }
}

function _restoreBodies(s, p) {
  for (const snap of s.bodySnaps) {
    snap.mesh.position.lerpVectors(_zero, snap.localPos, Math.min(p, 1));
    snap.mesh.scale.copy(snap.scale).multiplyScalar(Math.min(p, 1));
  }
}

// ── Shockwave emitter ─────────────────────────────────────────────────────────

function _emitShockwave(s, startR, speed, maxLife, hue, sat, lit) {
  const sw = s.shockwaves.find(w => w.life <= 0);
  if (!sw) return;
  sw.r = startR; sw.speed = speed; sw.life = maxLife; sw.maxLife = maxLife;
  sw.mesh.scale.setScalar(startR);
  sw.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  sw.mat.color.setHSL(hue, sat, lit);
  sw.mat.opacity = 0.65;
  sw.mesh.visible = true;
}

// ── Easing ────────────────────────────────────────────────────────────────────

function _easeOut(t) { const c = Math.min(Math.max(t, 0), 1); return 1 - (1 - c) ** 3; }
function _easeIn(t)  { return Math.min(Math.max(t, 0), 1) ** 3; }
