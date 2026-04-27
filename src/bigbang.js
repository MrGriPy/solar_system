import * as THREE from 'three';

// ── Made in Heaven — 78s Universe Creation Sequence ──────────────────────────
//
// Phase 0  [0–10s]   ACCELERATION       speed 1→600 (exponential)        ▲ extended
// Phase 1  [10–14s]  COLLAPSE           planets implode → singularity
// Phase 2  [14–18s]  BIG BANG           particle fireball (brief flash)
// Phase 3  [18–23s]  QUARK EPOCH        quark-gluon plasma + spiral decel
// Phase 4  [23–25s]  RECOMBINATION      CMB glow, universe cools & clears
// Phase 5  [25–27s]  DARK AGES          hydrogen clouds, blue shimmer
// Phase 6  [27–33s]  FIRST STARS        Population III ignite, reionization
// Phase 7  [33–36s]  SOLAR NEBULA       protoplanetary disk swirls
// Phase 8  [36–42s]  ACCRETION          planets condense from inside out
// Phase 9  [42–44s]  SOLAR SYSTEM       orbits restore, time resumes
// ─────────────────────────────────────────────────────────────────────────────

let heavenState = null;

export function initHeaven(scene, bodies, belt, kuiperBelt) {
  return {
    trigger()   { if (!heavenState) _start(scene, bodies, belt, kuiperBelt); },
    tick(delta) { return heavenState ? _tick(delta) : null; },
    isActive()  { return !!heavenState; },
  };
}

// ── Internal start ────────────────────────────────────────────────────────────

function _start(scene, bodies, belt, kuiperBelt) {
  _injectStyles();

  const overlay = document.createElement('div');
  overlay.id = 'hv-overlay';
  document.body.appendChild(overlay);

  const statusEl = document.createElement('div');
  statusEl.id = 'hv-status';
  document.body.appendChild(statusEl);

  const epochEl = document.createElement('div');
  epochEl.id = 'hv-epoch';
  document.body.appendChild(epochEl);

  const particles  = _createParticles(scene);
  const nebulaDisk = _createNebulaDisk(scene);
  const starField  = _createStarField(scene);
  const shockwave  = _createShockwave(scene);

  const audio = document.getElementById('heaven-audio');
  if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }

  // Hide terminal, elevate speed panel above blocking overlay
  const terminal   = document.getElementById('terminal');
  const speedPanel = document.getElementById('speed-panel');
  const speedDisp  = document.getElementById('speed-display');
  if (terminal)   terminal.style.display  = 'none';
  if (speedPanel) speedPanel.style.zIndex = '10001';

  // Fade out planet labels with CSS transition
  const labelsContainer = document.getElementById('labels-container');
  if (labelsContainer) {
    labelsContainer.style.transition = 'opacity 2s';
    labelsContainer.style.opacity    = '0';
  }

  // Collect unique belt materials — fade via opacity, never scale from origin
  const beltMats   = new Set();
  const kuiperMats = new Set();
  belt?.group?.traverse(c => { if (c.isMesh) { c.material.transparent = true; c.material.needsUpdate = true; beltMats.add(c.material); } });
  kuiperBelt?.group?.traverse(c => { if (c.isMesh) { c.material.transparent = true; c.material.needsUpdate = true; kuiperMats.add(c.material); } });

  // Collect visible orbit lines — save original material state for clean restore
  const orbitLines = [];
  for (const body of Object.values(bodies)) {
    if (body.orbitLine && body.orbitLine.visible) {
      const mat = body.orbitLine.material;
      body.orbitLine._savedOpacity      = mat.opacity;
      body.orbitLine._savedTransparent  = mat.transparent;
      mat.transparent = true;
      orbitLines.push(body.orbitLine);
    }
  }

  heavenState = {
    t: 0,
    scene,
    bodies,
    belt,
    kuiperBelt,
    overlay,
    statusEl,
    epochEl,
    particles,
    nebulaDisk,
    starField,
    shockwave,
    audio,
    bangFired: false,
    terminal,
    speedPanel,
    speedDisp,
    orbitLines,
    labelsContainer,
    beltMats:   [...beltMats],
    kuiperMats: [...kuiperMats],
  };
}

// ── CSS injection ─────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('hv-styles')) return;
  const s = document.createElement('style');
  s.id = 'hv-styles';
  s.textContent = `
    #hv-overlay {
      position: fixed; inset: 0; pointer-events: none;
      z-index: 9998; background: transparent;
    }
    #hv-status {
      position: fixed; bottom: 80px; left: 50%;
      transform: translateX(-50%);
      font: 700 0.85rem 'Courier New', monospace;
      letter-spacing: 0.3em; color: #ffffff;
      background: rgba(0,0,0,0.65);
      padding: 6px 18px; border-radius: 4px;
      text-transform: uppercase;
      pointer-events: none; z-index: 10002;
      opacity: 0; transition: opacity 0.5s;
      text-align: center; white-space: nowrap;
    }
    #hv-epoch {
      position: fixed; top: 28px; left: 50%;
      transform: translateX(-50%);
      font: 300 0.68rem 'Courier New', monospace;
      letter-spacing: 0.55em; color: rgba(200,220,255,0.65);
      pointer-events: none; z-index: 10002;
      opacity: 0; transition: opacity 1.2s;
      text-align: center; white-space: nowrap;
      text-transform: uppercase;
    }
    @keyframes hv-pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
    #hv-epoch.active { animation: hv-pulse 2.5s ease-in-out infinite; }
    @keyframes hv-scanline {
      0%   { background-position: 0 0; }
      100% { background-position: 0 100px; }
    }
    #hv-scanlines {
      position: fixed; inset: 0; pointer-events: none; z-index: 9999;
      background: repeating-linear-gradient(
        to bottom,
        transparent 0px, transparent 3px,
        rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px
      );
      animation: hv-scanline 0.4s linear infinite;
      opacity: 0; transition: opacity 1s;
    }
  `;
  document.head.appendChild(s);

  const scanlines = document.createElement('div');
  scanlines.id = 'hv-scanlines';
  document.body.appendChild(scanlines);
}

// ── Three.js particle systems ─────────────────────────────────────────────────

function _createParticles(scene) {
  const COUNT = 28000;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const vel = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0;

    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const spd   = 20 + Math.pow(Math.random(), 1.5) * 300;
    vel[i * 3]     = spd * Math.sin(phi) * Math.cos(theta);
    vel[i * 3 + 1] = spd * Math.sin(phi) * Math.sin(theta);
    vel[i * 3 + 2] = spd * Math.cos(phi);

    // Start pure white-hot — recolored dynamically per phase
    col[i*3] = 1; col[i*3+1] = 1; col[i*3+2] = 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, sizeAttenuation: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    transparent: true, opacity: 1,
  });
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  scene.add(pts);
  return { pts, geo, vel };
}

function _createNebulaDisk(scene) {
  const COUNT = 9000;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    // Spiral arm distribution with vertical flattening
    const r     = 15 + Math.random() * 230;
    const arm   = Math.floor(Math.random() * 3) * (Math.PI * 2 / 3);
    const angle = arm + Math.random() * Math.PI * 0.9 + r * 0.018;
    const y     = (Math.random() - 0.5) * r * 0.14;
    pos[i*3]   = r * Math.cos(angle);
    pos[i*3+1] = y;
    pos[i*3+2] = r * Math.sin(angle);

    // Blue-violet / pink-magenta / cyan-teal palette
    const t = Math.random();
    if      (t < 0.35) { col[i*3]=0.35; col[i*3+1]=0.15; col[i*3+2]=0.95; } // deep violet
    else if (t < 0.60) { col[i*3]=0.85; col[i*3+1]=0.25; col[i*3+2]=0.65; } // pink-magenta
    else if (t < 0.80) { col[i*3]=0.15; col[i*3+1]=0.55; col[i*3+2]=1.00; } // cyan-blue
    else               { col[i*3]=0.95; col[i*3+1]=0.70; col[i*3+2]=0.20; } // warm orange (hot gas)
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.45, vertexColors: true, sizeAttenuation: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    transparent: true, opacity: 0,
  });
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  scene.add(pts);
  return { pts, geo };
}

function _createStarField(scene) {
  const COUNT = 4500;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  // Store base brightness per star for twinkle
  const base = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 160 + Math.random() * 420;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);

    // Population III: massive blue-white stars, some yellow dwarfs
    base[i] = 0.6 + Math.random() * 0.4;
    const t = Math.random();
    if      (t < 0.55) { col[i*3]=0.75; col[i*3+1]=0.88; col[i*3+2]=1.00; } // blue-white O/B
    else if (t < 0.80) { col[i*3]=1.00; col[i*3+1]=0.95; col[i*3+2]=0.75; } // yellow-white F/G
    else               { col[i*3]=1.00; col[i*3+1]=0.65; col[i*3+2]=0.30; } // orange giant K
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.9, vertexColors: true, sizeAttenuation: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    transparent: true, opacity: 0,
  });
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  scene.add(pts);
  return { pts, geo, base };
}

// ── Shockwave ring ────────────────────────────────────────────────────────────

function _createShockwave(scene) {
  const geo = new THREE.RingGeometry(0.1, 2, 128);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, side: THREE.DoubleSide,
    transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

// ── Main tick (called every frame when active) ────────────────────────────────
// Returns the speedFactor to use for tickSolarSystem this frame.

function _tick(delta) {
  const s = heavenState;
  s.t += delta;
  const t = s.t;

  // Fade out speed panel after 5s (one-shot)
  if (t > 9 && s.speedPanel && !s.speedHidden) {
    s.speedHidden = true;
    s.speedPanel.style.transition = 'opacity 1.2s ease';
    s.speedPanel.style.opacity    = '0';
  }

  // ── PHASE 0: TIME ACCELERATION [0–10s] ───────────────────────────────────
  if (t < 10) {
    const p      = t / 10;
    const pEased  = Math.pow(p, 1.4);        // ease-in: démarrage doux, fin dramatique
    const speed   = Math.pow(4000, pEased);  // ×1 → ×4000

    _setOverlay(s.overlay, 0, 0, 0, 0);

    const orbitOpacity = Math.max(0, 1 - p * 6);
    for (const line of s.orbitLines) {
      line.material.opacity = orbitOpacity;
      if (orbitOpacity === 0) line.visible = false;
    }

    // Poussière cosmique — particules pré-répandues lentement depuis le centre
    s.particles.pts.visible = true;
    s.particles.pts.material.opacity = Math.min(0.1, p * 0.13);
    const pos0 = s.particles.geo.attributes.position.array;
    const vel0 = s.particles.vel;
    for (let i = 0; i < pos0.length / 3; i++) {
      pos0[i*3]   += vel0[i*3]   * 0.006 * delta;
      pos0[i*3+1] += vel0[i*3+1] * 0.006 * delta;
      pos0[i*3+2] += vel0[i*3+2] * 0.006 * delta;
    }
    s.particles.geo.attributes.position.needsUpdate = true;

    const col0 = s.particles.geo.attributes.color.array;
    for (let i = 0; i < col0.length / 3; i++) {
      col0[i*3] = 0.55; col0[i*3+1] = 0.70; col0[i*3+2] = 1.0;
    }
    s.particles.geo.attributes.color.needsUpdate = true;

    if (s.speedDisp) s.speedDisp.textContent = speed >= 100 ? `×${Math.round(speed)}` : speed >= 10 ? `×${speed.toFixed(1)}` : `×${speed.toFixed(2)}`;
    _setStatus(s.statusEl,
      p < 0.28 ? 'ACCÉLÉRATION TEMPORELLE...' :
      p < 0.60 ? 'COMPRESSION DU TEMPS...' :
      p < 0.88 ? 'SINGULARITÉ IMMINENTE...' : 'RESET UNIVERSEL...');
    _setEpoch(s.epochEl, '');
    return speed;
  }

  // ── PHASE 1: COLLAPSE [10–14s] ────────────────────────────────────────────
  if (t < 14) {
    const p = (t - 10) / 4;

    for (const [id, body] of Object.entries(s.bodies)) {
      if (!body.pivot || id === 'soleil') continue;
      body.mesh.position.x = _bodyDist(body) * Math.pow(1 - p, 2.4);
      body.mesh.scale.setScalar(Math.max(0.001, 1 - p));
    }

    const beltScale = Math.max(0, 1 - p * 2.2);
    if (s.belt?.group)       { s.belt.group.scale.setScalar(beltScale);       if (beltScale < 0.01) s.belt.group.visible       = false; }
    if (s.kuiperBelt?.group) { s.kuiperBelt.group.scale.setScalar(beltScale); if (beltScale < 0.01) s.kuiperBelt.group.visible = false; }

    // Sun swells into a proto-singularity
    s.bodies['soleil'].mesh.scale.setScalar(1 + p * 6.5);

    // Particules aspirées vers le centre — effondrement gravitationnel visible
    s.particles.pts.material.opacity = 0.08 + p * 0.22;
    const pos1 = s.particles.geo.attributes.position.array;
    const pull  = 0.05 * p; // accélère au fur et à mesure
    for (let i = 0; i < pos1.length / 3; i++) {
      pos1[i*3]   -= pos1[i*3]   * pull * delta;
      pos1[i*3+1] -= pos1[i*3+1] * pull * delta;
      pos1[i*3+2] -= pos1[i*3+2] * pull * delta;
    }
    s.particles.geo.attributes.position.needsUpdate = true;

    const col1 = s.particles.geo.attributes.color.array;
    for (let i = 0; i < col1.length / 3; i++) {
      col1[i*3] = 1.0; col1[i*3+1] = 0.4 + p * 0.4; col1[i*3+2] = p * 0.2;
    }
    s.particles.geo.attributes.color.needsUpdate = true;

    if (s.speedDisp) s.speedDisp.textContent = '×4000';
    _setOverlay(s.overlay, 0, 0, 0, 0);
    _setStatus(s.statusEl, p < 0.5 ? 'EFFONDREMENT GRAVITATIONNEL...' : 'SINGULARITÉ GRAVITATIONNELLE...');
    _setEpoch(s.epochEl, 'SINGULARITÉ');
    return 4000;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASES 2-9 : COUCHES CHEVAUCHANTES — chaque bloc a ses propres timings
  // ════════════════════════════════════════════════════════════════════════════

  // ── BANG INIT (fires once at t=14) ──────────────────────────────────────────
  if (!s.bangFired) {
    s.bangFired = true;
    s.particles.pts.visible = true;
    s.shockwave.visible     = true;
    for (const [id, body] of Object.entries(s.bodies)) {
      if (id !== 'soleil') { body.mesh.visible = false; body.mesh.scale.setScalar(1); }
    }
    if (s.belt?.group)       { s.belt.group.visible = true; s.belt.group.scale.setScalar(1); }
    if (s.kuiperBelt?.group) { s.kuiperBelt.group.visible = true; s.kuiperBelt.group.scale.setScalar(1); }
    for (const m of s.beltMats)   m.opacity = 0;
    for (const m of s.kuiperMats) m.opacity = 0;
  }
  if (s.speedDisp) s.speedDisp.textContent = '\u00d70';

  // ── SHOCKWAVE + SOLEIL [14–18s] ──────────────────────────────────────────────
  if (t < 18) {
    const p2 = (t - 14) / 4;
    const sunScale = p2 < 0.07 ? (7.5 + (p2/0.07)*9) : Math.max(1, 16.5 - p2*p2*15.5);
    s.bodies['soleil'].mesh.scale.setScalar(sunScale);
    s.shockwave.scale.setScalar(p2 * p2 * 360);
    s.shockwave.material.opacity = Math.max(0, 0.9 - p2 * 1.1);
  } else {
    s.bodies['soleil'].mesh.scale.setScalar(1);
  }

  // ── PHASES ACTIVES — chaque particule i appartient à phases[i%nP] ────────────
  //   mouvement ET couleur sont exclusifs à la phase propriétaire de la particule
  {
    const pos = s.particles.geo.attributes.position.array;
    const vel = s.particles.vel;
    const col = s.particles.geo.attributes.color.array;
    const N   = pos.length / 3;

    // ── Pré-calcul des paramètres par phase ──────────────────────────────────
    // [type, fade, ...params cinétiques, R, G, B]
    // type: 3=quark 4=CMB 5=darkages 6=implosion 7=stars 8=nebula
    const phases = [];

    if (t>=14 && t<30) {
      const f3 = t<16?(t-14)/2 : t<28?1 : Math.max(0,(30-t)/2);
      const v3 = 0.5 * Math.exp(0.25*(Math.min(t,23)-14));
      const pC = t<16?(t-14)/2:Math.min(1,(t-16)/14);
      const g3 = t<16 ? Math.max(0.25,1-pC*0.75) : Math.max(0.05,0.25-pC*0.20);
      const b3 = t<16 ? Math.max(0,1-pC*1.2) : 0;
      phases.push([3, f3, v3,  0, 0,  1.0, g3, b3]);
    }
    if (t>=23 && t<35) {
      const f4  = Math.min((t-23)/2,1)*Math.min(1,(35-t)/2);
      const p4  = Math.min(1,(t-23)/12);
      const vr4 = 4.74*Math.max(0,1-p4*4);
      const om4 = 0.18+p4*0.42;
      phases.push([4, f4, vr4, om4, 0,  0.55, 0.05, 0.95]);
    }
    if (t>=25 && t<37) {
      const f5  = Math.min((t-25)/2,1)*Math.min(1,(37-t)/2);
      const p5n = (t-25)/12;
      const om5 = 0.40+p5n*0.30;
      const pu5 = Math.pow(Math.max(0,Math.sin(t*5.0)),8)*60;
      const oc5 = Math.sin(t*9.0)*8.0;
      phases.push([5, f5, om5, pu5, oc5,  0.0, 0.85, 1.0]);
    }
    if (t>=27 && t<28) {
      const f6a  = t-27;
      const pull = 0.18+(t-27)*0.45;
      phases.push([6, f6a, pull, 0, 0,  0.9, 0.05, 0.05]);
    }
    if (t>=28 && t<38) {
      const f6b = Math.min(t-28,1)*Math.min(1,(38-t)/2);
      const p6b = Math.min(1,(t-28)/10);
      const vB6 = 5.0*Math.pow(1-p6b,1.0);
      const om6 = 0.10+p6b*0.15;
      phases.push([7, f6b, vB6, om6, 0,  1.0, 0.88, 0.25]);
    }
    if (t>=28 && t<39) {
      const f7  = Math.min((t-28)/1.5,1)*Math.min(1,(39-t)/2);
      const el7 = t-28;
      const om7 = 0.12+el7*0.14;   // vortex renforcé
      const vm7 = 0.015+el7*0.018;  // dérive initiale
      const ex7 = 18.0;              // expansion radiale XZ → couvre tout le système solaire
      phases.push([8, f7, om7, vm7, ex7,  0.15, 0.45, 1.0]);
    }

    // Montée dramatique avant fondu : sin 0→1→0 sur [33–36s]
    const _finale  = (t>=33 && t<36) ? Math.sin(Math.PI*(t-33)/3) : 0;
    // Ralentissement progressif dès P9 [35–40s] : 1→0
    const _fadeEnd = t>=35 ? Math.max(0, 1-(t-35)/5) : 1;

    const nP = phases.length;
    if (nP > 0) {
      // Opacité = max des fades actifs, boostée pendant le finale
      let maxOp = 0;
      for (let k=0; k<nP; k++) if (phases[k][1]>maxOp) maxOp=phases[k][1];
      s.particles.pts.material.opacity = Math.max(0.4, Math.min(1, maxOp * (1 + _finale)));

      // ── Boucle unique : chaque particule obéit à UNE SEULE phase ──────────
      for (let i=0; i<N; i++) {
        const ph  = phases[i % nP];
        const tp  = ph[0], f=ph[1];
        const ix=pos[i*3], iy=pos[i*3+1], iz=pos[i*3+2];
        const vx=vel[i*3], vy=vel[i*3+1], vz=vel[i*3+2];
        let dx=0, dy=0, dz=0;

        switch (tp) {
          case 3: { // Quark — expansion radiale
            const v3=ph[2];
            dx=vx*v3; dy=vy*v3; dz=vz*v3;
            break;
          }
          case 4: { // CMB — décélération + vortex
            const vr=ph[2], om=ph[3];
            dx=vx*vr-iz*om; dy=vy*vr; dz=vz*vr+ix*om;
            break;
          }
          case 5: { // Dark Ages — vortex électrique + pulses
            const om=ph[2], pu=ph[3], oc=ph[4];
            const r5=Math.sqrt(ix*ix+iz*iz)+0.001;
            dx=-iz*om+vx*0.012+(ix/r5)*pu;
            dy=vy*0.012+oc-iy*0.012;
            dz=ix*om+vz*0.012+(iz/r5)*pu;
            break;
          }
          case 6: { // Implosion gravitationnelle
            const pull=ph[2];
            dx=-ix*pull; dy=-iy*pull; dz=-iz*pull;
            break;
          }
          case 7: { // Explosion / premières étoiles
            const vB=ph[2], om=ph[3];
            const r6=Math.sqrt(ix*ix+iy*iy+iz*iz)+0.001;
            dx=ix/r6*vB-iz*om+vx*0.022;
            dy=iy/r6*vB       +vy*0.022;
            dz=iz/r6*vB+ix*om+vz*0.022;
            break;
          }
          case 8: { // Nébuleuse — vortex spiralé + expansion vers le système solaire
            const om=ph[2], vm=ph[3], ex=ph[4];
            const r8=Math.sqrt(ix*ix+iz*iz)+0.001; // rayon dans le plan XZ
            dx=-iz*om+(ix/r8)*ex+vx*vm;
            dy=vy*vm-iy*0.45;                       // compression verticale → disque
            dz=ix*om+(iz/r8)*ex+vz*vm;
            break;
          }
        }

        // Mouvement : boost finale, PAS de ralentissement (_fadeEnd hors mouvement)
        const fMove = Math.min(1.6, f*(1+_finale*0.8));
        pos[i*3]  +=dx*fMove*delta;
        pos[i*3+1]+=dy*fMove*delta;
        pos[i*3+2]+=dz*fMove*delta;
        const d2=pos[i*3]*pos[i*3]+pos[i*3+1]*pos[i*3+1]+pos[i*3+2]*pos[i*3+2];
        if(d2>560*560){pos[i*3]=0;pos[i*3+1]=0;pos[i*3+2]=0;}

        // Couleur : _fadeEnd seulement ici → particules s'estompent sans ralentir
        const fCol = fMove * _fadeEnd;
        const cB=_finale*0.35;
        col[i*3]  =Math.min(1,ph[5]*fCol+cB);
        col[i*3+1]=Math.min(1,ph[6]*fCol+cB);
        col[i*3+2]=Math.min(1,ph[7]*fCol+cB);
      }

      s.particles.geo.attributes.position.needsUpdate = true;
      s.particles.geo.attributes.color.needsUpdate    = true;
    }
  }

  // ── CHAMP D'ÉTOILES [27–38s] ─────────────────────────────────────────────────
  if (t >= 27 && t < 38) {
    if (!s.starField.pts.visible) s.starField.pts.visible = true;
    s.starField.pts.material.opacity = Math.min(1, (t-27)/11 * 3.0);
    const starCol  = s.starField.geo.attributes.color.array;
    const starBase = s.starField.base;
    for (let i = 0; i < starBase.length; i++) {
      const tw = starBase[i] * (0.65 + Math.sin(t*3.5+i*0.41)*0.35);
      const isBlue = (i%3 !== 2);
      starCol[i*3]  =(isBlue?0.75:1.00)*tw;
      starCol[i*3+1]=(isBlue?0.88:0.65)*tw;
      starCol[i*3+2]=(isBlue?1.00:0.30)*tw;
    }
    s.starField.geo.attributes.color.needsUpdate = true;
  } else {
    s.starField.pts.material.opacity = 0;
  }

  // ── DISQUE NÉBULAIRE [28–39s] ─────────────────────────────────────────────────
  if (t >= 28 && t < 39) {
    if (!s.nebulaDisk.pts.visible) s.nebulaDisk.pts.visible = true;
    const p7 = (t-28)/11;
    s.nebulaDisk.pts.material.opacity = Math.min(0.85, p7 * 1.4);
    s.nebulaDisk.pts.rotation.y += delta * (0.25 + p7 * 0.30);
  } else {
    s.nebulaDisk.pts.material.opacity = 0;
  }

  // ── P8 ACCRÉTION [25–35s] : ceintures + planètes ─────────────────────────────
  if (t >= 25 && t < 35) {
    const p8  = (t - 25) / 10;
    const el8 = t - 25;
    for (const m of s.beltMats)   m.opacity = Math.min(1, p8 * 1.6);
    for (const m of s.kuiperMats) m.opacity = Math.min(1, p8 * 1.3);
    if (s.belt?.group)       s.belt.group.rotation.y       += (0.0051  / 10) * el8 * delta;
    if (s.kuiperBelt?.group) s.kuiperBelt.group.rotation.y += (0.00076 / 10) * el8 * delta;
    for (const [id, body] of Object.entries(s.bodies)) {
      if (!body.pivot || id === 'soleil') continue;
      const distFraction = _bodyDist(body) / 350;
      const startFrac    = 0.08 + distFraction * 0.55;
      const win          = Math.max(0.01, 1 - startFrac);
      const localP       = Math.min(1, Math.max(0, (p8 - startFrac) / win));
      if (localP > 0) {
        body.mesh.visible    = true;
        body.mesh.position.x = _bodyDist(body);
        body.mesh.scale.setScalar(_easeOutCubic(localP));
      }
    }
  }

  // ── P9 RESTAURATION [35–40s] ──────────────────────────────────────────────────
  if (t >= 35) {
    const p9 = Math.min(1, (t - 35) / 5);
    s.particles.pts.material.opacity  = Math.max(0, Math.pow(1 - p9, 1.5));
    s.starField.pts.material.opacity   = 0;
    s.nebulaDisk.pts.material.opacity  = 0;
    s.shockwave.material.opacity       = 0;
    for (const line of s.orbitLines) {
      line.visible = true;
      line.material.opacity = Math.min(1, p9 * 2) * (line._savedOpacity ?? 0.25);
    }
    if (!s.labelsReturned) {
      s.labelsReturned = true;
      if (s.labelsContainer) {
        s.labelsContainer.style.transition = 'opacity 2s';
        s.labelsContainer.style.opacity    = '1';
      }
    }
    for (const [id, body] of Object.entries(s.bodies)) {
      if (!body.pivot || id === 'soleil') continue;
      body.mesh.visible    = true;
      body.mesh.position.x = _bodyDist(body);
      body.mesh.scale.setScalar(1);
    }
    const returnSpeed = _easeOutCubic(p9);
    if (s.speedDisp) s.speedDisp.textContent = returnSpeed > 0.05 ? `\u00d7${returnSpeed.toFixed(2)}` : '\u00d70.00';
    _setStatus(s.statusEl, p9 < 0.88 ? 'SYST\u00c8ME SOLAIRE ACTUEL...' : '');
    _setEpoch(s.epochEl, 'aujourd\'hui');
    _setOverlay(s.overlay, 0, 0, 0, 0);
    if (t >= 40) { _end(); return 1; }
    return returnSpeed;
  }

  // ── TEXTE DE STATUT (priorité : phase la plus récente) ───────────────────────
  _setOverlay(s.overlay, 0, 0, 0, 0);
  if (t >= 28) {
    const p7 = (t-28)/11;
    _setStatus(s.statusEl,
      t < 28.5 ? 'IGNITION DES PREMI\u00c8RES \u00c9TOILES...' :
      p7 < 0.40 ? 'N\u00c9BULEUSE SOLAIRE PRIMORDIALE...' :
      p7 < 0.72 ? 'DISQUE PROTOPLAN\u00c9TAIRE...' : 'FORMATION DES PLAN\u00c8TES...');
    _setEpoch(s.epochEl, t < 28.5 ? 't \u223c 500 Ma' : 'il y a \u223c 4,6 milliards d\'ann\u00e9es');
  } else if (t >= 27) {
    _setStatus(s.statusEl, 'EFFONDREMENT GRAVITATIONNEL...');
    _setEpoch(s.epochEl, 't \u223c 500 Ma');
  } else if (t >= 25) {
    _setStatus(s.statusEl, t < 26 ? '\u00c2GES SOMBRES...' : 'NUAGES D\'HYDROG\u00c8NE PRIMORDIAL...');
    _setEpoch(s.epochEl, 't \u223c 100 \u2013 500 Ma');
  } else if (t >= 23) {
    _setStatus(s.statusEl,
      t < 24 ? 'RECOMBINAISON ATOMIQUE...' :
      t < 24.5 ? 'FOND DIFFUS COSMOLOGIQUE...' : 'UNIVERS TRANSPARENT...');
    _setEpoch(s.epochEl, t < 24 ? 't \u223c 380\u00a0000 ans' : 't \u223c 500\u00a0000 ans');
  } else if (t >= 16) {
    _setStatus(s.statusEl,
      t < 18 ? 'SOUPE DE QUARKS ET GLUONS...' :
      t < 22 ? '\u00c9POQUE DES HADRONS...' : 'NUCL\u00c9OSYNTH\u00c8SE PRIMORDIALE...');
    _setEpoch(s.epochEl, t < 18 ? 't \u223c 10\u207b\u2076 s' : t < 22 ? 't \u223c 1 s' : 't \u223c 3 min');
  } else {
    _setStatus(s.statusEl, t < 15 ? 'BIG BANG' : 'EXPANSION PRIMORDIALE...');
    _setEpoch(s.epochEl, 't < 10\u207b\u00b3\u00b2 s');
  }

  return 0;
}


// ── Cleanup ───────────────────────────────────────────────────────────────────

function _end() {
  if (!heavenState) return;
  const { scene, bodies, belt, kuiperBelt, overlay, statusEl, epochEl,
          particles, nebulaDisk, starField, shockwave, audio,
          terminal, speedPanel, speedDisp, orbitLines, labelsContainer,
          beltMats, kuiperMats } = heavenState;

  for (const [id, body] of Object.entries(bodies)) {
    if (!body.pivot) continue;
    body.mesh.visible = true;
    body.mesh.scale.setScalar(1);
    body.mesh.position.x = _bodyDist(body);
  }
  bodies['soleil'].mesh.scale.setScalar(1);
  if (belt?.group)       { belt.group.visible = true;       belt.group.scale.setScalar(1); for (const m of (beltMats   ?? [])) m.opacity = 1; }
  if (kuiperBelt?.group) { kuiperBelt.group.visible = true; kuiperBelt.group.scale.setScalar(1); for (const m of (kuiperMats ?? [])) m.opacity = 1; }

  // Restore orbit lines — exact original state
  for (const line of (orbitLines ?? [])) {
    line.visible = true;
    line.material.opacity     = line._savedOpacity     ?? 0.25;
    line.material.transparent = line._savedTransparent ?? true;
    line.material.needsUpdate = true;
  }

  // Fade labels back in
  if (labelsContainer) {
    labelsContainer.style.transition = 'opacity 2s';
    labelsContainer.style.opacity    = '1';
  }

  // Restore UI
  if (terminal)   terminal.style.display  = '';
  if (speedPanel) { speedPanel.style.transition = ''; speedPanel.style.opacity = ''; speedPanel.style.zIndex = ''; }
  if (speedDisp)  speedDisp.textContent   = '\u00d71.0';

  document.body.style.transform = '';
  overlay.remove();
  statusEl.remove();
  epochEl?.remove();

  const scanlines = document.getElementById('hv-scanlines');
  if (scanlines) scanlines.remove();

  scene.remove(particles.pts);
  particles.geo.dispose();
  particles.pts.material.dispose();

  scene.remove(nebulaDisk.pts);
  nebulaDisk.geo.dispose();
  nebulaDisk.pts.material.dispose();

  scene.remove(starField.pts);
  starField.geo.dispose();
  starField.pts.material.dispose();

  scene.remove(shockwave);
  shockwave.geometry.dispose();
  shockwave.material.dispose();

  if (audio) audio.pause();

  heavenState = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _setOverlay(el, r, g, b, a) {
  el.style.background = `rgba(${r|0},${g|0},${b|0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function _setStatus(el, text) {
  if (!el) return;
  const t = heavenState ? heavenState.t : 0;
  if (t >= 7 && t < 9) {
    el.style.opacity = '1';
    if (el.textContent !== 'MADE IN HEAVEN') el.textContent = 'MADE IN HEAVEN';
    return;
  }
  el.style.opacity = '0';
}

function _setEpoch(el, text) {
  if (!el) return;
  el.style.opacity = '0';
}

function _bodyDist(body) {
  return body.data.distance ?? body.data.distanceFromEarth ?? 0;
}

function _easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function _easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
