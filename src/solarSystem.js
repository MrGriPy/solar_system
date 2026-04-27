import * as THREE from 'three';
import { PLANETS, SUN_DATA, MOON_DATA, DWARF_PLANETS } from './planetData.js';
import { buildAllTextures, makeRockTexture, makeIceTexture, makeSunTexture } from './textures.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createStarField(scene) {
  // Stellar color palette: blue giants, white A-type, yellow G-type, orange K, red M
  const starColors = [
    [0.6, 0.75, 1.0],   // blue-white (O/B type)
    [0.8, 0.88, 1.0],   // blue-white (A type)
    [1.0, 1.0,  0.95],  // white
    [1.0, 0.97, 0.82],  // yellow-white (F/G type, sun-like)
    [1.0, 0.85, 0.55],  // yellow-orange (K type)
    [1.0, 0.55, 0.35],  // orange-red (M type)
    [0.95, 0.4, 0.3],   // deep red giant
  ];

  // Layer 1: dense background (small, faint)
  const bgCount = 18000;
  const bgPos   = new Float32Array(bgCount * 3);
  const bgCol   = new Float32Array(bgCount * 3);
  const bgSizes = new Float32Array(bgCount);
  for (let i = 0; i < bgCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 850 + Math.random() * 500;
    bgPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    bgPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    bgPos[i*3+2] = r * Math.cos(phi);
    const c = starColors[Math.floor(Math.random() * starColors.length)];
    const bright = 0.55 + Math.random() * 0.45;
    bgCol[i*3] = c[0] * bright; bgCol[i*3+1] = c[1] * bright; bgCol[i*3+2] = c[2] * bright;
    bgSizes[i] = 0.35 + Math.random() * 0.55;
  }
  const bgGeo = new THREE.BufferGeometry();
  bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
  bgGeo.setAttribute('color',    new THREE.BufferAttribute(bgCol, 3));
  bgGeo.setAttribute('size',     new THREE.BufferAttribute(bgSizes, 1));
  scene.add(new THREE.Points(bgGeo,
    new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true })));

  // Layer 2: bright foreground stars (larger, more vivid)
  const fgCount = 1800;
  const fgPos   = new Float32Array(fgCount * 3);
  const fgCol   = new Float32Array(fgCount * 3);
  for (let i = 0; i < fgCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 800 + Math.random() * 300;
    fgPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    fgPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    fgPos[i*3+2] = r * Math.cos(phi);
    const c = starColors[Math.floor(Math.random() * starColors.length)];
    fgCol[i*3] = c[0]; fgCol[i*3+1] = c[1]; fgCol[i*3+2] = c[2];
  }
  const fgGeo = new THREE.BufferGeometry();
  fgGeo.setAttribute('position', new THREE.BufferAttribute(fgPos, 3));
  fgGeo.setAttribute('color',    new THREE.BufferAttribute(fgCol, 3));
  scene.add(new THREE.Points(fgGeo,
    new THREE.PointsMaterial({ size: 1.4, vertexColors: true, sizeAttenuation: true,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 })));
}

function createOrbitLine(radius, color = 0x334466, segments = 200) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 });
  return new THREE.Line(geo, mat);
}

function createPlanetMesh(data, textures) {
  const geo = new THREE.SphereGeometry(data.radius, 64, 32);
  const tex = textures?.[data.id];
  const mat = new THREE.MeshStandardMaterial({
    color:    tex?.map ? 0xffffff : data.color,
    map:      tex?.map || null,
    emissive: new THREE.Color(data.emissive),
    emissiveIntensity: 0.0,
    roughness: 0.88,
    metalness: 0.0,
  });
  return new THREE.Mesh(geo, mat);
}

function buildSunGlowSprite(radius) {
  const S = 512, cx = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');

  // Rays — alternating long/short
  const nRays = 20;
  for (let i = 0; i < nRays; i++) {
    const angle  = (i / nRays) * Math.PI * 2;
    const long   = (i % 2 === 0);
    const len    = cx * (long ? 0.98 : 0.72);
    const hw     = long ? 4 : 2.5;
    ctx.save();
    ctx.translate(cx, cx);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0.00, 'rgba(255,255,210,0.55)');
    g.addColorStop(0.10, 'rgba(255,230,120,0.30)');
    g.addColorStop(0.40, 'rgba(255,160, 20,0.10)');
    g.addColorStop(1.00, 'rgba(255,100,  0,0.00)');
    ctx.fillStyle = g;
    ctx.fillRect(0, -hw, len, hw * 2);
    ctx.restore();
  }

  // Core radial glow
  const glow = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  glow.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  glow.addColorStop(0.06, 'rgba(255,255,220,0.95)');
  glow.addColorStop(0.18, 'rgba(255,230, 80,0.70)');
  glow.addColorStop(0.36, 'rgba(255,160, 10,0.30)');
  glow.addColorStop(0.58, 'rgba(255, 90,  0,0.10)');
  glow.addColorStop(1.00, 'rgba(200, 40,  0,0.00)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(radius * 2.8);
  return sprite;
}

function createSunMesh(data) {
  const geo = new THREE.SphereGeometry(data.radius, 64, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xFFFDE8 });
  const mesh = new THREE.Mesh(geo, mat);

  // Layered additive glow halos — tighter, less overwhelming
  const layers = [
    { r: 1.04, col: 0xFFFFDD, op: 0.45 },
    { r: 1.12, col: 0xFFEE77, op: 0.18 },
    { r: 1.35, col: 0xFFCC33, op: 0.08 },
    { r: 2.00, col: 0xFF9900, op: 0.030 },
    { r: 3.50, col: 0xFF6600, op: 0.012 },
  ];
  for (const l of layers) {
    const g = new THREE.SphereGeometry(data.radius * l.r, 32, 16);
    const m = new THREE.MeshBasicMaterial({
      color: l.col, transparent: true, opacity: l.op,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    mesh.add(new THREE.Mesh(g, m));
  }

  // Starburst sprite (rays)
  mesh.add(buildSunGlowSprite(data.radius));

  return mesh;
}

function createRings(planet, data, textures) {
  if (!data.ringColor) return null;

  const innerR = data.radius * (data.ringThin ? 1.3 : 1.18);
  const outerR = data.radius * (data.ringThin ? 1.65 : 2.4);

  const geo = new THREE.RingGeometry(innerR, outerR, 256);
  // UV fix for ring geometry — map u from 0 (inner) to 1 (outer)
  const pos = geo.attributes.position;
  const uv  = geo.attributes.uv;
  const v3  = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v3.fromBufferAttribute(pos, i);
    uv.setXY(i, (v3.length() - innerR) / (outerR - innerR), 0.5);
  }
  uv.needsUpdate = true;

  const ringTex = (!data.ringThin && textures?.['saturne']?.ringMap) ? textures['saturne'].ringMap : null;
  const mat = new THREE.MeshBasicMaterial({
    color: ringTex ? 0xffffff : data.ringColor,
    map: ringTex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: data.ringThin ? 0.4 : 1.0,
    alphaTest: 0.01,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI / 2;
  return ring;
}

function addSurfaceDetail(mesh, data) {
  // Jupiter: banded appearance via emissive map simulation (procedural stripes)
  if (data.id === 'jupiter') {
    mesh.material.emissive = new THREE.Color(0x4A2A00);
    mesh.material.emissiveIntensity = 0.2;
  }
  // Earth: slightly blueish tint on "ocean side" - just use material color with variation
  if (data.id === 'terre') {
    mesh.material.emissive = new THREE.Color(0x001833);
    mesh.material.emissiveIntensity = 0.12;
  }
}

// Shared helper: place instanced rocks with varied shapes in a torus band
function populateBelt(scene, group, innerR, outerR, count, baseSize, ySpread, rockTex, color = 0xffffff) {
  const geos = [
    new THREE.DodecahedronGeometry(baseSize, 0),
    new THREE.IcosahedronGeometry(baseSize, 0),
    new THREE.OctahedronGeometry(baseSize * 1.1, 1),
  ];
  const mat = new THREE.MeshStandardMaterial({
    map: rockTex,
    color,
    roughness: 0.92,
    metalness: 0.04,
  });
  const perGeo = Math.ceil(count / geos.length);
  const dummy  = new THREE.Object3D();

  for (const geo of geos) {
    const mesh = new THREE.InstancedMesh(geo, mat, perGeo);
    mesh.castShadow = false;
    for (let i = 0; i < perGeo; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = innerR + Math.random() * (outerR - innerR);
      const y     = (Math.random() - 0.5) * ySpread;
      dummy.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      dummy.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      // Non-uniform scale: elongated/squashed rocks
      const s = 0.25 + Math.random() * Math.random() * 2.2;
      dummy.scale.set(
        s * (0.5 + Math.random() * 0.9),
        s * (0.4 + Math.random() * 0.7),
        s * (0.5 + Math.random() * 1.1)
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
}

// Asteroid belt
function createAsteroidBelt(scene) {
  const group   = new THREE.Group();
  const rockTex = makeRockTexture();
  populateBelt(scene, group, 56, 68, 2400, 0.15, 2.5, rockTex);
  scene.add(group);
  return { group };
}

// Kuiper belt
function createKuiperBelt(scene) {
  const group   = new THREE.Group();
  const iceTex  = makeIceTexture();
  populateBelt(scene, group, 248, 340, 5000, 0.55, 3.5, iceTex, 0x3D5A80);
  scene.add(group);
  return { group };
}

// ── Main solar system builder ─────────────────────────────────────────────────

export function buildSolarSystem(scene) {
  const bodies = {};
  const textures = buildAllTextures();

  // ── Lighting ──────────────────────────────────────────────────────────────
  const sunLight = new THREE.PointLight(0xFFEEAA, 3.5, 0, 0);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);

  // Ambient: dark side softly visible but clearly darker than lit side
  const ambientLight = new THREE.AmbientLight(0x334466, 0.35);
  scene.add(ambientLight);

  // ── Stars ─────────────────────────────────────────────────────────────────
  createStarField(scene);

  // ── Sun ───────────────────────────────────────────────────────────────────
  const sunMesh = createSunMesh(SUN_DATA);
  sunMesh.userData = { id: 'soleil', type: 'body' };
  scene.add(sunMesh);
  bodies['soleil'] = { mesh: sunMesh, pivot: null, data: SUN_DATA, orbitAngle: 0 };

  // ── Planets ───────────────────────────────────────────────────────────────
  for (const data of PLANETS) {
    // Orbit line
    const orbitLine = createOrbitLine(data.distance, 0x2244AA);
    scene.add(orbitLine);

    // Pivot (orbit container)
    const pivot = new THREE.Object3D();
    pivot.rotation.y = Math.random() * Math.PI * 2; // random start angle
    scene.add(pivot);

    // Planet mesh
    const mesh = createPlanetMesh(data, textures);
    mesh.position.set(data.distance, 0, 0);
    mesh.rotation.z = THREE.MathUtils.degToRad(data.tilt || 0);
    mesh.userData = { id: data.id, type: 'body' };
    addSurfaceDetail(mesh, data);

    // Rings
    if (data.ringColor) {
      const ring = createRings(mesh, data, textures);
      if (ring) mesh.add(ring);
    }

    pivot.add(mesh);

    bodies[data.id] = {
      mesh,
      pivot,
      data,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitLine,
    };
  }

  // ── Moon ──────────────────────────────────────────────────────────────────
  const earthBody = bodies['terre'];
  const moonPivot = new THREE.Object3D();
  earthBody.mesh.add(moonPivot);

  const moonMesh = createPlanetMesh(MOON_DATA, textures);
  moonMesh.position.set(MOON_DATA.distanceFromEarth, 0, 0);
  moonMesh.userData = { id: 'lune', type: 'body' };
  moonPivot.add(moonMesh);

  bodies['lune'] = {
    mesh: moonMesh,
    pivot: moonPivot,
    data: MOON_DATA,
    orbitAngle: 0,
    parentBody: earthBody,
  };

  // ── Asteroid Belt ─────────────────────────────────────────────────────────
  const belt = createAsteroidBelt(scene);

  // ── Kuiper Belt ───────────────────────────────────────────────────────────
  const kuiperBelt = createKuiperBelt(scene);

  // ── Dwarf Planets ─────────────────────────────────────────────────────────
  for (const data of DWARF_PLANETS) {
    const pivot = new THREE.Object3D();
    scene.add(pivot);

    const mesh = createPlanetMesh(data, textures);
    mesh.rotation.z = THREE.MathUtils.degToRad(data.tilt || 0);
    mesh.position.set(data.distance, 0, 0);
    mesh.userData = { id: data.id, type: 'body' };
    pivot.add(mesh);

    bodies[data.id] = {
      mesh,
      pivot,
      data,
      orbitAngle: Math.random() * Math.PI * 2,
    };
  }

  return { bodies, belt, kuiperBelt, sunLight, ambientLight };
}

// ── Animation tick ────────────────────────────────────────────────────────────

export function tickSolarSystem(bodies, belt, delta, speedFactor, kuiperBelt) {
  const dt = delta * speedFactor;

  // Sun self-rotation
  bodies['soleil'].mesh.rotation.y += 0.001 * dt;

  for (const id of Object.keys(bodies)) {
    const body = bodies[id];
    if (!body.data || id === 'soleil') continue;

    const data = body.data;

    // Orbit
    if (body.pivot) {
      body.orbitAngle += data.orbitSpeed * dt;
      body.pivot.rotation.y = body.orbitAngle;
    }

    // Self rotation
    body.mesh.rotation.y += data.rotationSpeed * dt;
  }

  // Asteroid belt — Kepler outer-edge speed (dist=68): v = 0.00802*(50/68)^1.04 ≈ 0.0051
  if (belt?.group) {
    belt.group.rotation.y += 0.0051 * dt;
  }
  // Kuiper belt — Kepler from Neptune (dist=290): v = 0.00182*(230/290)^1.04 ≈ 0.00076
  if (kuiperBelt?.group) {
    kuiperBelt.group.rotation.y += 0.00076 * dt;
  }
}

// ── Get world position of a body ──────────────────────────────────────────────

export function getBodyWorldPosition(body) {
  const pos = new THREE.Vector3();
  body.mesh.getWorldPosition(pos);
  return pos;
}
