import * as THREE from 'three';

// ── Noise helpers ─────────────────────────────────────────────────────────────

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix,   iy),   b = hash(ix+1, iy);
  const c = hash(ix, iy+1),   d = hash(ix+1, iy+1);
  return a + (b-a)*ux + (c-a)*uy + (d-b)*ux*uy - (c-a)*ux*uy;
}

function fbm(x, y, oct = 5) {
  let v = 0, amp = 0.5, freq = 1, max = 0;
  for (let i = 0; i < oct; i++) {
    v   += smoothNoise(x * freq, y * freq) * amp;
    max += amp;
    amp  *= 0.5;
    freq *= 2.1;
  }
  return v / max;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lc(c1, c2, t) {
  return [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t)];
}

// ── Core builder: uses ImageData for 100× faster pixel writes ─────────────────
// pixelFn(nx, ny, nz, lat, lon) → [r, g, b]  (all 0–255)
function makeTexture(W, H, pixelFn, postFn) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx  = canvas.getContext('2d');
  const img  = ctx.createImageData(W, H);
  const data = img.data;

  for (let py = 0; py < H; py++) {
    const lat = (py / H - 0.5) * Math.PI;          // -π/2 … +π/2
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let px = 0; px < W; px++) {
      const lon = (px / W) * Math.PI * 2;           // 0 … 2π (seamless)
      const nx = cosLat * Math.cos(lon);
      const ny = cosLat * Math.sin(lon);
      const nz = sinLat;

      const [r, g, b] = pixelFn(nx, ny, nz, lat, lon);
      const i = (py * W + px) * 4;
      data[i]   = clamp(Math.round(r), 0, 255);
      data[i+1] = clamp(Math.round(g), 0, 255);
      data[i+2] = clamp(Math.round(b), 0, 255);
      data[i+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (postFn) postFn(ctx, W, H);     // overlay craters / spots etc.

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ── Per-planet texture generators ─────────────────────────────────────────────
// All use makeTexture() → ImageData (fast) + spherical coords (seamless).

// ─── Sun ──────────────────────────────────────────────────────────────────────
export function makeSunTexture() {
  return makeTexture(512, 256, (nx, ny, nz, lat) => {
    // ── Granulation: convective cells ────────────────────────────────────────
    const g1 = fbm(nx * 9  + ny * 7,        ny * 8  + nz * 6,        5);
    const g2 = fbm(nx * 18 + nz * 12 + 1.7, ny * 16 + nx * 10 + 2.3, 4);
    const g3 = fbm(ny * 6  + nz * 9  + 3.1, nx * 7  + ny * 5  + 0.9, 3);
    // Cell edges dark, cell interior bright
    const gran = clamp(g1 * 0.5 + g2 * 0.3 + g3 * 0.2, 0, 1);
    const cell = Math.pow(gran, 0.6);   // boost brighter areas

    // ── Plasma flows (large-scale turbulence) ────────────────────────────────
    const flow = fbm(nx * 3 + ny * 2, ny * 3 + nz * 2, 4) * 0.25;

    // ── Limb darkening: edges redder/darker ──────────────────────────────────
    // nx²+ny²+nz² = 1; limb = |lat| proximity; use nz as equator normal
    const cosTheta = clamp(Math.abs(nx * 0.3 + ny * 0.5 + nz * 0.8), 0, 1);
    const limb = 0.55 + 0.45 * Math.pow(cosTheta, 0.4);

    // ── Sunspots: small dark magnetic regions ────────────────────────────────
    const sp1 = fbm(nx * 4 + 0.7,  ny * 3 + nz * 2 + 1.5, 2);
    const sp2 = fbm(nx * 5 + nz * 3 + 2.1, ny * 4 + 0.3,  2);
    const spot = clamp((sp1 - 0.64) * 10, 0, 1) * clamp((sp2 - 0.60) * 12, 0, 1);
    // Only near equatorial band (|lat| < 35°)
    const latBand = clamp(1.0 - Math.abs(lat) / 0.62, 0, 1);
    const spotDark = 1.0 - spot * latBand * 0.72;

    // ── Active regions: bright plasma faculae ────────────────────────────────
    const fac = fbm(nx * 6 + ny * 5 + 5, nz * 6 + nx * 4 + 3, 3);
    const facula = clamp((fac - 0.63) * 8, 0, 1) * latBand * 0.4;

    // ── Combine ──────────────────────────────────────────────────────────────
    const bright = clamp((cell + flow + facula) * limb * spotDark, 0, 1);

    // ── Color ramp: deep red-orange → orange → yellow → white-yellow ─────────
    let r, g, b;
    if (bright < 0.25) {
      const t = bright / 0.25;
      r = lerp(140, 220, t);  g = lerp(18, 65, t);   b = lerp(0, 0, t);
    } else if (bright < 0.55) {
      const t = (bright - 0.25) / 0.30;
      r = lerp(220, 255, t);  g = lerp(65, 170, t);  b = lerp(0, 10, t);
    } else if (bright < 0.80) {
      const t = (bright - 0.55) / 0.25;
      r = 255;                g = lerp(170, 220, t); b = lerp(10, 60, t);
    } else {
      const t = (bright - 0.80) / 0.20;
      r = 255;                g = lerp(220, 248, t); b = lerp(60, 160, t);
    }
    return [r, g, b];
  });
}

// ─── Mercury ──────────────────────────────────────────────────────────────────
export function makeMercuryTexture() {
  const tex = new THREE.TextureLoader().load('/textures/mercury.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Venus ────────────────────────────────────────────────────────────────────
export function makeVenusTexture() {
  const tex = new THREE.TextureLoader().load('/textures/venus.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Earth ────────────────────────────────────────────────────────────────────
export function makeEarthTexture() {
  const tex = new THREE.TextureLoader().load('/textures/earth.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Mars ─────────────────────────────────────────────────────────────────────
export function makeMarsTexture() {
  const tex = new THREE.TextureLoader().load('/textures/mars.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Jupiter ──────────────────────────────────────────────────────────────────
export function makeJupiterTexture() {
  const tex = new THREE.TextureLoader().load('/textures/jupiter.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Saturn ───────────────────────────────────────────────────────────────────
export function makeSaturnTexture() {
  const tex = new THREE.TextureLoader().load('/textures/saturn.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Saturn Ring Texture ──────────────────────────────────────────────────────
export function makeSaturnRingTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0.00, 'rgba(0,0,0,0)');
  g.addColorStop(0.05, 'rgba(145,115,75,0.12)');
  g.addColorStop(0.12, 'rgba(165,135,88,0.52)');
  g.addColorStop(0.20, 'rgba(178,150,102,0.72)');
  g.addColorStop(0.28, 'rgba(158,128,82,0.48)');
  g.addColorStop(0.35, 'rgba(198,172,118,0.82)');
  g.addColorStop(0.42, 'rgba(188,162,108,0.62)');
  g.addColorStop(0.50, 'rgba(208,182,128,0.88)');
  g.addColorStop(0.58, 'rgba(182,155,102,0.58)');
  g.addColorStop(0.65, 'rgba(162,135,88,0.42)');
  g.addColorStop(0.72, 'rgba(178,150,98,0.68)');
  g.addColorStop(0.80, 'rgba(158,128,80,0.38)');
  g.addColorStop(0.88, 'rgba(138,112,70,0.22)');
  g.addColorStop(0.95, 'rgba(118,98,60,0.08)');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 1);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// ─── Uranus ───────────────────────────────────────────────────────────────────
export function makeUranusTexture() {
  const tex = new THREE.TextureLoader().load('/textures/uranus.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Neptune ──────────────────────────────────────────────────────────────────
export function makeNeptuneTexture() {
  const tex = new THREE.TextureLoader().load('/textures/neptune.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Moon ─────────────────────────────────────────────────────────────────────
export function makeMoonTexture() {
  const tex = new THREE.TextureLoader().load('/textures/moon.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Ice texture (Kuiper belt) ────────────────────────────────────────────────
export function makeIceTexture() {
  return makeTexture(128, 128, (nx, ny, nz) => {
    const n1 = fbm(nx * 6 + ny * 4,  ny * 5 + nz * 4,  4);
    const n2 = fbm(nx * 12 + nz * 8 + 1.3, nz * 10 + ny * 7 + 2.1, 3);
    const t  = clamp(n1 * 0.6 + n2 * 0.4, 0, 1);
    // Crack veins: very dark on low-t areas
    const crack = clamp((0.3 - t) / 0.15, 0, 1);
    const base = lerp(85, 155, t);
    return [
      clamp(base - 12 - crack * 35, 0, 255),  // R (less)
      clamp(base -  4 - crack * 25, 0, 255),  // G (mid)
      clamp(base + 22 - crack *  8, 0, 255),  // B (more → blue tint)
    ];
  });
}

// ─── Rock texture (asteroid belt & Kuiper belt) ───────────────────────────────
export function makeRockTexture() {
  return makeTexture(128, 128, (nx, ny, nz) => {
    const n1 = fbm(nx * 5 + ny * 3,  ny * 4 + nz * 3,  5);
    const n2 = fbm(nx * 9 + nz * 6,  nz * 8 + ny * 5,  4);
    const n3 = fbm(ny * 7 + nx * 4 + 2.3, nz * 6 + nx * 3, 3);
    const t  = clamp(n1 * 0.5 + n2 * 0.3 + n3 * 0.2, 0, 1);
    // Crack darken: sharp crinkle on low-t areas
    const crack = clamp((0.35 - t) / 0.18, 0, 1);
    const base = lerp(52, 118, t);
    return [
      clamp(base + 10 - crack * 30, 0, 255),
      clamp(base +  5 - crack * 25, 0, 255),
      clamp(base -  8 - crack * 18, 0, 255),
    ];
  });
}

// ─── Dwarf planets ───────────────────────────────────────────────────────────────────
export function makeCeresTexture() {
  const tex = new THREE.TextureLoader().load('/textures/ceres.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export function makePlutoTexture() {
  // Procedural: reddish-brown with lighter heart-shaped region
  return makeTexture(256, 128, (nx, ny, nz, lat) => {
    const n  = fbm(nx * 4 + ny * 3, ny * 4 + nz * 3, 5);
    const n2 = fbm(nx * 7 + 3, nz * 6 + ny * 4, 4);
    const t  = clamp(n * 0.6 + n2 * 0.4, 0, 1);
    let col = lc([95, 55, 35], [210, 165, 115], t);
    // Heart (Tombaugh Regio) — lighter patch on one hemisphere
    const heartN = fbm(nx * 3 + 5, ny * 3 + nz * 2 + 5, 3);
    const heart = clamp((heartN - 0.52) / 0.18, 0, 1) * clamp((0.55 - Math.abs(lat)) / 0.55, 0, 1);
    col = lc(col, [235, 215, 190], heart * 0.75);
    return col;
  });
}
export function makeErisTexture() {
  const tex = new THREE.TextureLoader().load('/textures/eris.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export function makeHaumeaTexture() {
  const tex = new THREE.TextureLoader().load('/textures/haumea.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export function makeMakemakeTexture() {
  const tex = new THREE.TextureLoader().load('/textures/makemake.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Build all textures ───────────────────────────────────────────────────────────────────────
export function buildAllTextures() {
  return {
    soleil:    { map: makeSunTexture()      },
    mercure:   { map: makeMercuryTexture()  },
    venus:     { map: makeVenusTexture()    },
    terre:     { map: makeEarthTexture()    },
    mars:      { map: makeMarsTexture()     },
    jupiter:   { map: makeJupiterTexture()  },
    saturne:   { map: makeSaturnTexture(), ringMap: makeSaturnRingTexture() },
    uranus:    { map: makeUranusTexture()   },
    neptune:   { map: makeNeptuneTexture()  },
    lune:      { map: makeMoonTexture()     },
    ceres:     { map: makeCeresTexture()    },
    pluto:     { map: makePlutoTexture()    },
    eris:      { map: makeErisTexture()     },
    haumea:    { map: makeHaumeaTexture()   },
    makemake:  { map: makeMakemakeTexture() },
  };
}
