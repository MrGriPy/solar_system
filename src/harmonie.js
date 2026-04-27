import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Harmonie — Vaisseau Comète de Mario Galaxy ────────────────────────────────
//
// Phase 0  [0–5s]   APPARITION   fondu opacité 0→1, position de départ lointaine
// Phase 1  [5–30s]  VOL          navigation spline à travers le système solaire
// Phase 2  [30–38s] MISE EN ORBITE   décélération et entrée en orbite
// Phase 3  [38s+]   ORBITE       orbite autour du soleil, proche de la Terre
// ─────────────────────────────────────────────────────────────────────────────

let harmonieState = null;

export function initHarmonie(scene, bodies) {
  return {
    trigger()        { if (!harmonieState) _start(scene, bodies); },
    tick(delta)      { if (harmonieState) _tick(delta); },
    isActive()       { return !!harmonieState; },
    isOrbiting()     { return harmonieState?.phase === 'orbit'; },
    getClickMesh()   { return harmonieState?.hitMesh || null; },
    openStory()      { _openStorybook(); },
  };
}

// ── 3D ship loader — comete_observatoire.glb ─────────────────────────────────

function _loadShip(scene, onLoaded) {
  const group   = new THREE.Group();
  const allMats = [];

  // ── Lights ────────────────────────────────────────────────────────────────
  const shipLight = new THREE.PointLight(0xCCBBFF, 2.2, 22);
  shipLight.position.y = 1.5;
  group.add(shipLight);
  const baseLight = new THREE.PointLight(0xAA88FF, 1.0, 14);
  baseLight.position.y = -2.5;
  group.add(baseLight);

  // ── Invisible hit sphere ──────────────────────────────────────────────────
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(375, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 })
  );
  hitMesh.userData = { id: 'harmonie' };
  group.add(hitMesh);

  group.scale.setScalar(0.008);
  scene.add(group);

  // ── Async GLB load ────────────────────────────────────────────────────────
  const loader = new GLTFLoader();
  loader.load('/assets/comete_observatoire.glb', (gltf) => {
    const model = gltf.scene;
    model.traverse(c => {
      if (c.isMesh) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of mats) {
          if (!allMats.includes(m)) {
            m.transparent = true;
            m.opacity     = 0;
            m.needsUpdate = true;
            allMats.push(m);
          }
        }
      }
    });
    model.rotation.x = Math.PI * -0.22;
    model.rotation.z = Math.PI * -0.08;
    group.add(model);
    if (onLoaded) onLoaded();
  }, undefined, (err) => console.error('[Harmonie] GLB load error:', err));

  return { group, allMats, hitMesh };
}

// ── Comet trail (position ring-buffer → fading Line) ─────────────────────────

const TRAIL_COUNT = 120;

function _buildTrail(scene) {
  const positions = new Float32Array(TRAIL_COUNT * 3);
  const colors    = new Float32Array(TRAIL_COUNT * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  const history = Array.from({ length: TRAIL_COUNT }, () => new THREE.Vector3());
  return { line, geo, mat, history, head: 0, filled: 0 };
}

// ── Smooth-rotation helper ────────────────────────────────────────────────────

const _lookAtHelper = new THREE.Object3D();

function _targetQuat(fromPos, toPos) {
  _lookAtHelper.position.copy(fromPos);
  _lookAtHelper.lookAt(toPos);
  _lookAtHelper.rotateX(Math.PI / 2);
  return _lookAtHelper.quaternion.clone();
}

// ── Flight spline ─────────────────────────────────────────────────────────────
// Approaches from deep space at high inclination to stay above planet collisions.
// Earth is at r=38, Mars at r=50. Final orbit at r=44, y≈2.

function _buildSpline() {
  const pts = [
    new THREE.Vector3( 520,  95,   10),
    new THREE.Vector3( 350,  88,  240),
    new THREE.Vector3( 190,  62,  200),
    new THREE.Vector3( 105,  42,  -90),
    new THREE.Vector3(  72,  25, -100),
    new THREE.Vector3(  58,  14,  -68),
    new THREE.Vector3(  48,   7,   52),
    new THREE.Vector3(  44,   3,   28),
    new THREE.Vector3(  43,   2,    0),
  ];
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
}

// ── Internal start ────────────────────────────────────────────────────────────

function _start(scene, bodies) {
  _injectStyles();

  const trail    = _buildTrail(scene);
  const spline   = _buildSpline();
  const statusEl = _makeStatusEl();

  // Orbit parameters — finalized when ship arrives
  const orbitRadius  = 44;
  const orbitIncline = 0.045; // radians
  const orbitSpeed   = 0.007; // slightly slower than Earth

  const audio = document.getElementById('harmonie-audio');
  if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }

  const { group, allMats, hitMesh } = _loadShip(scene, () => {
    // GLB loaded — if ship is already fading in, sync opacity to current p
    if (harmonieState && harmonieState.phase === 'appear') {
      const p = Math.min(1, harmonieState.t / 5);
      for (const m of allMats) m.opacity = p;
    }
  });

  const startPos = spline.getPoint(0);
  group.position.copy(startPos);

  harmonieState = {
    t: 0,
    phase: 'appear', // appear → fly → arrive → orbit
    scene,
    bodies,
    group,
    allMats,
    hitMesh,
    trail,
    spline,
    statusEl,
    audio,
    orbitRadius,
    orbitIncline,
    orbitSpeed,
    orbitAngle: 0,
  };
}

// ── Status element ────────────────────────────────────────────────────────────

function _makeStatusEl() {
  const el = document.createElement('div');
  el.id = 'hm-status';
  document.body.appendChild(el);
  return el;
}

// ── Main tick ─────────────────────────────────────────────────────────────────

function _tick(delta) {
  const s = harmonieState;
  s.t += delta;
  const t = s.t;

  // ── PHASE appear [0–5s] ───────────────────────────────────────────────────
  if (s.phase === 'appear') {
    const p = Math.min(1, t / 5);
    _setOpacity(s, p);
    s.trail.mat.opacity = 0;
    if (t >= 5) { s.phase = 'fly'; }
    _updateTrail(s, delta);
    return;
  }

  // ── PHASE fly [5–30s] ──────────────────────────────────────────────────────
  if (s.phase === 'fly') {
    const elapsed  = t - 5;
    const duration = 25;
    const p        = Math.min(1, elapsed / duration);
    const splineT  = p * 0.92;

    const newPos = s.spline.getPoint(splineT);
    s.group.position.copy(newPos);

    // Smooth orientation — slerp toward travel direction
    const ahead    = s.spline.getPoint(Math.min(1, splineT + 0.006));
    const tQuat    = _targetQuat(newPos, ahead);
    s.group.quaternion.slerp(tQuat, Math.min(1.0, 7.0 * delta));

    _updateTrail(s, delta);
    if (t >= 30) { s.phase = 'arrive'; }
    return;
  }

  // ── PHASE arrive [30–38s] ─────────────────────────────────────────────────
  if (s.phase === 'arrive') {
    const elapsed  = t - 30;
    const duration = 8;
    const p        = Math.min(1, elapsed / duration);
    const ease     = _easeInOut(p);

    const splineT   = 0.92 + ease * 0.08;
    const splinePos = s.spline.getPoint(Math.min(1, splineT));

    const entryAngle = Math.atan2(splinePos.z, splinePos.x);
    s.orbitAngle     = entryAngle;

    const targetX = Math.cos(s.orbitAngle) * s.orbitRadius;
    const targetZ = Math.sin(s.orbitAngle) * s.orbitRadius;
    const targetY = Math.sin(s.orbitAngle * 0.5) * s.orbitRadius * s.orbitIncline;

    const blendPos = splinePos.clone().lerp(new THREE.Vector3(targetX, targetY, targetZ), ease);
    s.group.position.copy(blendPos);

    const nextAngle  = s.orbitAngle + 0.05;
    const orbitAhead = new THREE.Vector3(
      Math.cos(nextAngle) * s.orbitRadius,
      Math.sin(nextAngle * 0.5) * s.orbitRadius * s.orbitIncline,
      Math.sin(nextAngle) * s.orbitRadius
    );
    const tQuat = _targetQuat(blendPos, orbitAhead);
    s.group.quaternion.slerp(tQuat, Math.min(1.0, 5.0 * delta));

    _updateTrail(s, delta);

    if (t >= 38) { s.phase = 'orbit'; }
    return;
  }

  // ── PHASE orbit [38s+] ────────────────────────────────────────────────────
  if (s.phase === 'orbit') {
    s.orbitAngle += s.orbitSpeed * delta * 6;

    const x = Math.cos(s.orbitAngle) * s.orbitRadius;
    const z = Math.sin(s.orbitAngle) * s.orbitRadius;
    const y = Math.sin(s.orbitAngle * 0.5) * s.orbitRadius * s.orbitIncline;
    s.group.position.set(x, y, z);

    const nextAngle = s.orbitAngle + 0.05;
    const ahead = new THREE.Vector3(
      Math.cos(nextAngle) * s.orbitRadius,
      Math.sin(nextAngle * 0.5) * s.orbitRadius * s.orbitIncline,
      Math.sin(nextAngle) * s.orbitRadius
    );
    const tQuat = _targetQuat(s.group.position, ahead);
    s.group.quaternion.slerp(tQuat, Math.min(1.0, 4.0 * delta));

    _updateTrail(s, delta);
  }
}

// ── Set ship opacity ──────────────────────────────────────────────────────────

function _setOpacity(s, opacity) {
  for (const m of s.allMats) m.opacity = opacity;
}

// ── Comet trail update (ring-buffer → fading line) ───────────────────────────

function _updateTrail(s, delta) {
  const tr = s.trail;
  const C  = TRAIL_COUNT;

  // Push current ship world position into ring buffer
  tr.history[tr.head].copy(s.group.position);
  tr.head = (tr.head + 1) % C;
  if (tr.filled < C) tr.filled++;

  const pos = tr.geo.attributes.position.array;
  const col = tr.geo.attributes.color.array;

  for (let i = 0; i < C; i++) {
    // i=0 → oldest (far tail), i=filled-1 → newest (near ship)
    const ringIdx = (tr.head - tr.filled + i + C * 4) % C;
    const frac    = tr.filled > 1 ? i / (tr.filled - 1) : 0; // 0=old → 1=new

    pos[i * 3]     = tr.history[ringIdx].x;
    pos[i * 3 + 1] = tr.history[ringIdx].y;
    pos[i * 3 + 2] = tr.history[ringIdx].z;

    // Quadratic fade: dark at tail, bright blue-white near ship
    const b        = frac * frac;
    col[i * 3]     = 0.50 * b;
    col[i * 3 + 1] = 0.72 * b;
    col[i * 3 + 2] = 1.00 * b;
  }

  tr.geo.attributes.position.needsUpdate = true;
  tr.geo.attributes.color.needsUpdate    = true;

  // Fade trail out when orbiting (ship barely moves), fade in during flight
  if (s.phase === 'orbit') {
    tr.mat.opacity = Math.max(0,    tr.mat.opacity - delta * 0.6);
  } else {
    tr.mat.opacity = Math.min(0.90, tr.mat.opacity + delta * 2.5);
  }
}

// ── Storybook pages ───────────────────────────────────────────────────────────

const STORY_PAGES = [
  {
    title: 'Chapitre I · Tous les deux',
    illus: '🌠',
    text: `Il était une fois, il y a très, très longtemps, sur une petite planète bleue…
... une fillette découvrit un vieux vaisseau rouillé. À l'intérieur vivait un Luma, un petit enfant étoile.
La fillette demanda au Luma  :
« Qui es-tu ? Et que fais-tu ici ? »
« J'attends ma maman. Elle doit venir me chercher avec sa comète. » répondit le Luma qui attendait, attendait nuit et jour depuis des lustres.
« Ne t'inquiète pas, je vais t'aider à chercher ta maman. » lui promit solennellement la fillette.
La nuit tombée, la fillette emprunta en cachette le télescope de son père et se mit à scruter le firmament. Mais elle eut beau chercher pendant des heures, elle ne découvrit aucune trace de la comète. Elle essaya encore pendant les jours, puis les années qui suivirent mais les cieux restaient désespérément vides.
Un jour, la fillette dit au Luma :
« Si ça continue comme ça, je serai grand-mère avant qu'on la trouve ! »
Et elle poussa un grand soupir…
Mais soudain, elle eut une idée.
« Et si nous partions à la rencontre de ta maman ? »
La fillette et le Luma remirent le vieux vaisseau en état et embarquèrent en direction des étoiles.
C'est ainsi que débuta leur voyage à la recherche de la maman du Luma.`,
  },
  {
    title: 'Chapitre II · Les éclats d\'étoiles',
    illus: '⭐',
    text: `Plusieurs jours avaient passé depuis le départ, mais ils n'avaient pas croisé la moindre planète sur leur route. Les astéroïdes et les débris cosmiques s'étendaient à perte de vue.
« Si j'avais su, j'aurais emporté plus de confiture... » dit la fillette en frottant son ventre qui gargouillait.
Avant le départ, elle avait empaqueté du pain de seigle, du lait, de la confiture de framboise et du thé parfumé à l'abricot, mais elle avait oublié quelque chose d'essentiel…
« Je n'ai pas pris d'eau ! Ce que je peux être tête en l'air ! »
À ces mots, le Luma se mit à rire aux éclats.
« Moi, tant que j'ai des éclats d'étoiles, ça me suffit. Tu veux goûter ? »
La fillette répondit avec une pointe d'ironie :
« Ah, me voilà rassurée. Je pensais que tu ne riais jamais. »
Et le Luma de rire, rire… au point que la fillette finit par rire avec lui.
« Bon, dans ce cas, pourquoi pas ! Je vais en goûter une bouchée. »
Grâce au filet à papillons de son frère qu'elle avait emporté, la fillette commença à attraper des éclats d'étoiles. Elle se penchait à l'extérieur du vaisseau pour atteindre les cristaux scintillants, et faillit en tomber plus d'une fois ! Lorsqu'elle en eut attrapé suffisamment, elle en glissa une poignée dans sa bouche. Ils avaient un goût sucré proche du miel.`,
  },
  {
    title: 'Chapitre III · L\'étoile scintillante',
    illus: '✨',
    text: `Un jour, un rayon de lumière pénétra par le hublot du vaisseau.
« Le soleil se lève ? Ça faisait longtemps ! »
Et, regardant par la fenêtre, la fillette aperçut un astre magnifique, couleur émeraude, brillant de mille feux.
Secouant le Luma endormi pour le réveiller, la fillette lui dit :
« Allons voir ce qu'il y a sur cet astre ! »
Le corps céleste sur lequel ils avaient atterri semblait fait de glace lumineuse.
Le Luma et la fillette l'explorèrent minutieusement, mais ne trouvèrent aucune trace de la maman du Luma. Exténuée, la fillette se laissa choir sur le sol.
« On dirait que ta maman n'est pas ici… »
Soudain, le Luma s'écria :
« Regarde ! »
Dans l'épaisseur du sol gelé que lui montrait le Luma, la fillette aperçut de nombreux éclats d'étoiles !
« C'est formidable, hein ?! » dit fièrement le Luma.
« Même si cet astre est fait de glace, la température y est très agréable ! Et je suis sûr qu'on peut y trouver de l'eau ! »
D'un commun accord, ils décidèrent de s'installer quelque temps dans ce nouveau paradis.
Ainsi, se laissant porter par le courant des étoiles scintillantes, les deux voyageurs poursuivirent leur recherche de la maman du Luma.`,
  },
  {
    title: 'Chapitre IV · Le rêve',
    illus: '💤',
    text: `Une nuit, la fillette rêva de sa mère.
« Où vas-tu, maman ? » demanda-t-elle à la silhouette de sa mère qui semblait s'éloigner.
Sans se retourner, sa mère lui répondit :
« Ne crains rien, je ne t'abandonne pas. Le jour, je serai le soleil. La nuit, je serai la lune. Ainsi, je veillerai toujours sur toi. »
Une vague de tristesse s'abattit sur la fillette :
« Et comment feras-tu lors des nuits pluvieuses, où il n'y a ni soleil, ni lune ? »
Après quelques instants de réflexion, sa mère répondit :
« Je me changerai en étoile et j'attendrai, par-delà les nuages, que tu arrêtes de pleurer. »
À son réveil, la fillette avait les yeux mouillés de larmes. Le Luma, allongé à ses côtés, demanda :
« Pourquoi est-ce que des éclats d'étoiles coulent de tes yeux ? »
Essuyant ses larmes, la fillette répondit :
« Malheureusement, ce ne sont pas des éclats d'étoiles. Je pleure parce que je ne reverrai jamais ma maman. »
Le Luma se mit à pleurer à son tour. « Maman… maman… »
Ils avaient croisé de nombreuses comètes au cours de leur périple intergalactique, mais aucune d'elles n'avait été celle de la maman du Luma.
« Ne pleure plus, petit Luma. Sinon, comment veux-tu que les nuages s'en aillent ? » dit la fillette en serrant tendrement le Luma dans ses bras.
« Si tu arrêtes de pleurer, je te ferai un cadeau. C'est moi qui serai ta maman désormais. »
En même temps que ces mots franchissaient ses lèvres, la fillette sentit une petite flamme s'allumer au fond de son cœur.`,
  },
  {
    title: 'Chapitre V · La maison',
    illus: '🏠',
    text: `« Ici, ce sera la cuisine, là, la bibliothèque, et par là, la salle de jeu ! » disait la fillette en s'affairant çà et là.
« Nous habiterons tous les deux dans la plus belle des maisons ! »
Depuis qu'elle avait décidé de devenir la maman du petit Luma, la fillette travaillait sans relâche.
Dans les profondeurs de la glace, la fillette avait découvert bien plus que des éclats d'étoiles. Il y avait là des outils, des meubles et des tas de choses étranges qu'elle n'avait jamais vues auparavant. Elle avait décidé qu'elle se servirait de tout cela pour bâtir leur demeure.
Contemplant la maison terminée, le Luma demanda sur un ton hésitant :
« Dis… ce n'est pas un peu grand pour nous deux ? »
Et en effet, toutes ces pièces - bibliothèque, cuisine, salle de bains… - donnaient moins une impression d'espace à l'ensemble qu'un grand sentiment de solitude.
« C'est vrai… Ni papa, ni mon petit frère ne sont là… ni maman… » dit la fillette d'une voix si basse qu'elle en était presque inaudible.
Décidément, cette maison était trop vaste pour deux si petits habitants.
Cette nuit-là, la fillette dormit dans le vaisseau, serrant très fort contre sa poitrine son lapin en peluche.`,
  },
  {
    title: 'Chapitre VI · Des amis',
    illus: '👥',
    text: `Un jour, alors que la fillette et le Luma se détendaient en buvant du thé, ils virent approcher lentement une petite planète couleur abricot.
Sur cette planète habitait un autre Luma.
« Tiens ? Un autre enfant étoile ? »
La fillette était ravie de cette visite impromptue, mais le Luma semblait un peu inquiet.
Le nouvel arrivant était de couleur orange, comme sa planète. Les deux Luma se fixèrent longuement du regard, sans que l'un ou l'autre ne fasse un pas en avant ou en arrière.
« C'est ma maman ! » dit le Luma, rompant le silence.
Ce à quoi le Luma orange, tel un perroquet, répliqua :
« C'est ma maman ! C'est ma maman ! »
Chacun des Luma tirait la fillette de son côté, et aucun des deux ne semblait prêt à céder.
Leur naïve dispute offrait un spectacle d'une telle innocence que la fillette ne pouvait s'empêchait de trouver la scène comique. Et soudain, alors qu'elle allait éclater de rire, un second Luma sortit de la planète abricot… puis un troisième, et bientôt une foule de Luma jaillirent les uns après les autres ! Des rouges, des bleus, des orange, des verts… mais tous reprenaient à tue-tête :
« C'est ma maman ! C'est ma maman ! »
À mesure que les voix de tous ces Luma s'amplifiaient, la fillette avait de plus en plus envie de rire. N'y tenant plus, elle s'esclaffa :
« Qu'est-ce que je vais faire ? J'ai vraiment beaucoup d'enfants, maintenant ! »
Les Luma, perplexes, regardaient la fillette qui riait en se tenant le ventre. Lorsqu'elle finit par se calmer, elle déclara :
« Bon, et bien il ne me reste plus qu'à trouver un nom pour chacun d'entre vous ! »
Et quand elle eut fini de nommer tous les Luma, elle songea qu'enfin, ils allaient pouvoir emménager dans leur nouvelle maison…`,
  },
  {
    title: 'Chapitre VII · Le télescope',
    illus: '🔭',
    text: `Alors qu'une centième comète passait à proximité, la fillette pensa :
« Je me demande si ma planète a toujours le même éclat bleu… »
Elle se souvint tout d'un coup du télescope de son père.
À travers l'objectif du télescope, elle vit au loin sa toute petite planète bleue, plus petite qu'un éclat d'étoile.
« C'est étrange… Elle est si loin, et pourtant je la sens si proche. »
En tournant la molette du télescope, la fillette agrandit la planète bleue, jusqu'à y discerner une petite colline.
« C'est la terrasse sur laquelle je me rendais pour observer les étoiles ! »
Cette colline était très proche du village dans lequel la fillette avait grandi. Ce paysage familier raviva en elle de nombreux souvenirs.
C'est de cette colline qu'elle scrutait le firmament avec son père, en frottant ses yeux engourdis de fatigue… Cette colline qu'elle dévalait sur sa luge, avec son frère, les jours de neige… Cette colline où elle partait pique-niquer avec sa mère les jours de beau temps, enveloppée par la brise… Tout cela semblait si loin…
« Je veux rentrer chez moi ! Je veux retrouver ma maison ! »
Les Luma semblaient perdus, ne sachant que faire pour consoler la fillette qui avait éclaté en sanglots.
« Je veux rentrer ! Je veux retourner chez moi, au pied de la colline ! »
La fillette criait, le visage inondé de larmes.
« Je sais la vérité ! Maman n'est pas dans les étoiles ! Parce qu'elle… elle… Elle repose au pied de l'arbre, sous la colline ! »
Les cris de la fillette résonnèrent à travers l'espace et tout, aux alentours, devint silencieux, comme figé.`,
  },
  {
    title: 'Chapitre VIII · Le vœu',
    illus: '💫',
    text: `Le chagrin de la fillette semblait ne devoir jamais s'arrêter. Le Luma s'approcha et lui dit :
« Ta maman… elle est toujours avec toi… »
À leur tour, les autres Luma se rassemblèrent autour de la fillette et tentèrent de la réconforter.
« Tu sais, ta maman est toujours à tes côtés, dans ton cœur, et elle veille sur toi… »
« Non… c'est faux… c'est faux ! »
La fillette était accablée de chagrin.
Le regard du Luma eut un éclat un peu triste, qui se changea soudain en un grand sourire. Il dit :
« Alors je vais exaucer ton vœu ! Je vais me changer en étoile. Une étoile filante qui te permettra de voyager où tu voudras ! »
Le Luma s'illumina d'une vive lumière blanche et s'envola très haut dans le ciel, avant de s'abattre sur le sol avec une force inouïe.
DADAM ! DADAM ! DADAM ! Le sol se mit à trembler, et une intense lumière blanche jaillit du trou dans lequel il s'était précipité. Des rayons de lumière jaillirent dans toutes les directions avant de se rassembler, de s'enrouler, pour finir par ne former qu'un long panache blanc qui devint la queue d'une magnifique comète. Le Luma était devenu une étoile filante.
La fillette ne comprenait pas ce qui se produisait sous ses yeux.
« Comment est-ce possible ? » ne cessait-elle de répéter.
S'approchant, un Luma rouge expliqua :
« Notre destin, à nous autres Luma, est de nous transformer en corps célestes. »
Un Luma vert poursuivit :
« Notre vœu le plus cher est de nous transformer en étoiles pour apporter le bonheur aux personnes que nous aimons… »
Un Luma bleu ajouta :
« Celui-ci est heureux, car il a pu devenir une superbe étoile. »
Et les Luma, tous en chœur :
« Alors tu ne dois plus être triste, maman ! »
« Merci… » dit la fillette d'une voix presque inaudible en prenant les Luma dans ses bras.
Depuis ce jour, la fillette ne laissa plus jamais un seul éclat d'étoile s'échapper de ses yeux.
La comète étira fièrement son panache étincelant et mit le cap sur le village de la fillette.`,
  },
  {
    title: 'Épilogue · Une famille',
    illus: '🌟',
    text: `Au fil du temps, la comète accueillait un nombre toujours grandissant de Luma, qui passaient leur temps à observer les étoiles.
« Aujourd'hui, nous accueillons un nouvel ami ! » dit un jour la fillette d'une voie plus enjouée qu'à l'accoutumée, en entraînant les Luma vers la cuisine.
« Nous allons faire du pain ! Un délicieux pain aux éclats d'étoiles ! »
Les Luma furent ravis ! Ils se pressèrent pour rassembler les ingrédients.
En elle-même, la fillette se disait :
« Je resterai pour toujours auprès d'eux. Je ferai en sorte qu'aucun d'eux ne se sente seul jusqu'au jour où ils quittent la maison. Et même le jour de leur départ, je les regarderai partir en souriant. »
« Car c'est cela, la joie d'être mère. »
Fermant les yeux, la fillette se remémora sa petite planète enveloppée d'une douce lumière.
« Mais j'aimerais bien, une fois tous les cent ans, retourner sur ma planète bleue, et m'assoupir sur les genoux de mon papa en caressant cette moustache qui fait sa fierté. »
La comète poursuit toujours son voyage, emportant avec elle la fillette et les Luma.
On dit qu'aujourd'hui, étirant son étincelant panache blanc, elle abrite une très grande famille. Et, une fois tous les cent ans, elle passe près de la planète natale de la jeune fille.`,
  },
  {
    title: 'Suite · Bonne nuit',
    illus: '🌙',
    text: `Bien qu'il fût l'heure de dormir, l'excitation des Lumas était telle qu'aucune histoire ne pouvait les calmer.
« Il sera comment, le nouveau monde ?
- J'espère qu'il sera encore plus fou que le dernier !
- Maman, j'ai peur ! Je peux dormir dans ton lit ? »
La fillette prit sa guitare et se mit à jouer une berceuse, assise sur le lit. Les Lumas se placèrent autour d'elle et se disputèrent la meilleure place pour l'écouter jouer.
Mais les notes de la douce et apaisante mélodie résonnèrent dans la chambre et bientôt le sommeil gagna les Lumas.
« Bonne nuit, mes petits. »
Mais les Lumas, auparavant si agités, avaient déjà sombrés dans le monde des rêves.
La fillette posa l'instrument à côté de l'oreiller et s'allongea sur le lit.
Bientôt la fillette rejoindrait les Lumas dans leur sommeil. Leur comète filerait par-delà des planètes d'autres lieux.
À leur réveil, ils continueraient leur recherche du berceau des Lumas.
Alors que le sommeil gagnait la fillette, elle pensa :
« J'adore les nouvelles rencontres. C'est toujours intéressant, même si ça fait parfois un peu peur. »
« Mais rendre visite à un vieil ami peut être tout aussi amusant. »
« La prochaine fois... Je visiterai peut-être un tout nouveau monde. »
« Au revoir à ceux que j'ai rencontré dans cette aventure... Ces souvenirs resteront à jamais gravés dans ma mémoire. »
« Quant à ceux que je rencontrerai dans la prochaine aventure, j'ai hâte de faire votre connaissance. »
« Que les étoiles vous protègent... »
« Bonne nuit. »
Les Lumas et la fillette à son bord, la comète traversait les cieux étoilés, suivant la lumière qui les mènerait à la prochaine aventure.

Fin`,
  },
];

// ── Storybook UI ──────────────────────────────────────────────────────────────

let storybookOpen = false;

function _openStorybook() {
  if (storybookOpen) return;
  storybookOpen = true;

  const audio = document.getElementById('sad-girl-audio');
  if (audio) { audio.currentTime = 0; audio.volume = 0.6; audio.play().catch(() => {}); }

  let currentPage = 0;

  const overlay = document.createElement('div');
  overlay.id = 'hm-book-overlay';

  const book = document.createElement('div');
  book.id = 'hm-book';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'hm-book-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => {
    overlay.classList.add('hm-fade-out');
    const audio2 = document.getElementById('sad-girl-audio');
    if (audio2) { audio2.pause(); audio2.currentTime = 0; }
    setTimeout(() => { overlay.remove(); storybookOpen = false; }, 600);
  });

  const stars = document.createElement('div');
  stars.id = 'hm-book-stars';

  const illus = document.createElement('div');
  illus.id = 'hm-book-illus';

  const content = document.createElement('div');
  content.id = 'hm-book-content';

  const titleEl = document.createElement('div');
  titleEl.id = 'hm-book-title';

  const textEl = document.createElement('div');
  textEl.id = 'hm-book-text';

  const nav = document.createElement('div');
  nav.id = 'hm-book-nav';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'hm-nav-btn';
  prevBtn.textContent = '◄';

  const pageNum = document.createElement('span');
  pageNum.id = 'hm-page-num';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'hm-nav-btn';
  nextBtn.textContent = '►';

  nav.append(prevBtn, pageNum, nextBtn);
  const textWrap = document.createElement('div');
  textWrap.id = 'hm-book-textwrap';
  textWrap.append(titleEl, textEl);
  content.append(textWrap, nav);
  book.append(closeBtn, stars, illus, content);
  overlay.appendChild(book);
  document.body.appendChild(overlay);

  function renderPage(idx) {
    const page = STORY_PAGES[idx];
    book.classList.add('hm-page-flip');
    setTimeout(() => book.classList.remove('hm-page-flip'), 350);

    illus.textContent   = page.illus;
    titleEl.textContent = page.title;
    textEl.textContent  = page.text;
    pageNum.textContent = `${idx + 1} / ${STORY_PAGES.length}`;
    prevBtn.disabled    = idx === 0;
    nextBtn.disabled    = idx === STORY_PAGES.length - 1;
  }

  prevBtn.addEventListener('click', () => {
    if (currentPage > 0) { currentPage--; renderPage(currentPage); }
  });
  nextBtn.addEventListener('click', () => {
    if (currentPage < STORY_PAGES.length - 1) { currentPage++; renderPage(currentPage); }
  });
  // Keyboard navigation while storybook is open
  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (currentPage < STORY_PAGES.length - 1) { currentPage++; renderPage(currentPage); }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (currentPage > 0) { currentPage--; renderPage(currentPage); }
    } else if (e.key === 'Escape') {
      closeBtn.click();
    }
    e.stopPropagation();
  }
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('remove', () => document.removeEventListener('keydown', onKey, true));
  // MutationObserver to clean up key listener when overlay removed
  const obs = new MutationObserver(() => {
    if (!document.contains(overlay)) {
      document.removeEventListener('keydown', onKey, true);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });

  renderPage(0);
  // Inject animated stars
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('span');
    s.className = 'hm-star';
    s.textContent = Math.random() > 0.5 ? '✦' : '·';
    s.style.cssText = `
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      animation-delay:${(Math.random() * 4).toFixed(2)}s;
      font-size:${(0.4 + Math.random() * 0.7).toFixed(2)}rem;
      opacity:${(0.1 + Math.random() * 0.5).toFixed(2)};
    `;
    stars.appendChild(s);
  }
}

// ── CSS injection ─────────────────────────────────────────────────────────────

function _injectStyles() {
  if (document.getElementById('hm-styles')) return;
  const s = document.createElement('style');
  s.id = 'hm-styles';
  s.textContent = `
    #hm-status {
      position: fixed; bottom: 80px; left: 50%;
      transform: translateX(-50%);
      font: 700 0.82rem 'Courier New', monospace;
      letter-spacing: 0.28em; color: #88DDFF;
      background: rgba(0,10,30,0.70);
      padding: 5px 18px; border-radius: 4px;
      border: 1px solid rgba(80,180,255,0.25);
      text-transform: uppercase;
      pointer-events: none; z-index: 10002;
      opacity: 0; transition: opacity 0.6s;
      white-space: nowrap;
    }
    #hm-status:not(:empty) { opacity: 1; }

    /* ── Storybook overlay ── */
    #hm-book-overlay {
      position: fixed; inset: 0;
      background: rgba(2, 4, 18, 0.88);
      backdrop-filter: blur(6px);
      z-index: 10100;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
      animation: hm-fadein 0.7s ease forwards;
    }
    #hm-book-overlay.hm-fade-out { animation: hm-fadeout 0.6s ease forwards; }

    @keyframes hm-fadein  { from { opacity:0 } to { opacity:1 } }
    @keyframes hm-fadeout { from { opacity:1 } to { opacity:0 } }

    #hm-book {
      position: relative;
      display: flex; flex-direction: row;
      width: min(1200px, 95vw);
      height: min(860px, 92vh);
      background: linear-gradient(135deg, #060c2a 0%, #0a1535 50%, #080e26 100%);
      border: 1px solid rgba(100, 180, 255, 0.3);
      border-radius: 16px;
      box-shadow: 0 0 60px rgba(80, 160, 255, 0.25), 0 0 120px rgba(50, 100, 200, 0.12);
      overflow: hidden;
      transition: transform 0.2s;
    }
    #hm-book.hm-page-flip { transform: scale(0.985); }

    #hm-book-stars {
      position: absolute; inset: 0; pointer-events: none; overflow: hidden;
    }
    .hm-star {
      position: absolute;
      color: #88CCFF;
      animation: hm-twinkle 3s ease-in-out infinite alternate;
      font-family: sans-serif;
    }
    @keyframes hm-twinkle {
      from { opacity: 0.1; transform: scale(0.8); }
      to   { opacity: 0.6; transform: scale(1.2); }
    }

    #hm-book-illus {
      flex: 0 0 200px;
      display: flex; align-items: center; justify-content: center;
      font-size: 5.5rem;
      border-right: 1px solid rgba(100, 180, 255, 0.18);
      background: rgba(0, 10, 40, 0.4);
      user-select: none;
      position: relative; z-index: 1;
      animation: hm-illus-glow 2.5s ease-in-out infinite alternate;
    }
    @keyframes hm-illus-glow {
      from { text-shadow: 0 0 20px rgba(100,200,255,0.3); }
      to   { text-shadow: 0 0 50px rgba(100,200,255,0.7), 0 0 10px rgba(255,255,255,0.5); }
    }

    #hm-book-content {
      flex: 1;
      padding: 36px 40px 28px;
      display: flex; flex-direction: column;
      position: relative; z-index: 1;
      overflow-y: auto;
    }

    #hm-book-textwrap {
      flex: 1;
      min-height: 0;
      display: flex; flex-direction: column;
      justify-content: center;
      gap: 14px;
    }

    #hm-book-title {
      font: 700 0.78rem 'Courier New', monospace;
      letter-spacing: 0.18em;
      color: #88CCFF;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(100, 180, 255, 0.2);
      padding-bottom: 10px;
    }

    #hm-book-text {
      font: 400 0.88rem Georgia, 'Times New Roman', serif;
      line-height: 1.85;
      color: #c8d8f0;
      white-space: pre-line;
    }

    #hm-book-nav {
      display: flex; align-items: center; gap: 16px;
      justify-content: center;
      border-top: 1px solid rgba(100, 180, 255, 0.15);
      padding-top: 14px;
    }

    .hm-nav-btn {
      background: rgba(80, 140, 255, 0.12);
      border: 1px solid rgba(80, 140, 255, 0.35);
      color: #88CCFF;
      font-family: 'Courier New', monospace;
      font-size: 1rem;
      width: 38px; height: 38px;
      border-radius: 50%;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, transform 0.15s;
    }
    .hm-nav-btn:hover:not(:disabled) {
      background: rgba(80, 140, 255, 0.3);
      border-color: #88CCFF;
      transform: scale(1.1);
    }
    .hm-nav-btn:disabled { opacity: 0.25; cursor: default; }

    #hm-page-num {
      font: 700 0.72rem 'Courier New', monospace;
      letter-spacing: 0.15em;
      color: #5a7090;
      min-width: 50px; text-align: center;
    }

    #hm-book-close {
      position: absolute; top: 14px; right: 16px;
      background: transparent; border: none;
      color: #5a7090; font-size: 1.1rem;
      cursor: pointer; z-index: 2;
      transition: color 0.2s;
    }
    #hm-book-close:hover { color: #ff4466; }

    @media (max-width: 720px) {
      #hm-book { flex-direction: column; width: 96vw; box-shadow: none; }
      #hm-book-illus { display: none; }
      #hm-book-content { padding: 20px 18px 16px; }
    }
  `;
  document.head.appendChild(s);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _setStatus(el, text) {
  if (!el) return;
  el.textContent = text;
}

function _easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
