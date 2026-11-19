// D-Planet〜紙の星〜 — Papertrails 標準化 移行ステップ4 の検証実装。
// 土台のレンダースタック（紙マテリアル / ライト+PCSS / ポストチェーン / 昼夜グレード）は
// foundation/（Papertrails, MIT, Copyright (c) 2026 Shikhar）を無改変で import して使う。
// ステップ4 の内容:
//   1. 広場タイルセット … タイル MAP データ（tiles.js）＋紙パーツで広場を再構成
//   2. 掲示板の本実装 … 現行掲示板と同形式の投稿を紙面印刷＋ページめくり（board.js）
//   3. ポータルの本実装 … 紙リング＋発光コア、遷移はアプリ層イベント接続（portal.js）
//      センター ⇔ サイバーセンター の2空間を往復できる
//   4. 描画バッチ化 … 静的パーツを BatchedMesh 化（batch.js）し draw calls ≤130 へ
//   5. アバター JSON 設計図 … avatar-blueprints.json の設計図から組み立て（avatar.js）
//      運営の完成品は公式アイテムと初期アバター（=設計図サンプル）のみ、が原則。
// ステップ6 の内容:
//   6. 部室（有限ページ）… 部屋定義データ（rooms-data.js）＋汎用ビルダー（room.js）で
//      カンボセンターを試作し、センター広場とポータル往復。2室目（ハペ部）は
//      データだけで生成し「住人が作れる」ことの証明にする。新しいエンジン機能は足さない。
//
// URL: ?night=1 ?pose=gate|walk ?cam=main|close|board|portal ?space=center|cyber
//      ?boardpage=N ?quality=high|med|low ?hud=0
// Keys: N 昼/夜 ・ B 掲示板 次ページ ・ V 前ページ ・ T ポータル遷移
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from '../foundation/src/core/state.js';
import { createRenderer } from '../foundation/src/render/renderer.js';
import { createMaterials } from '../foundation/src/render/materials.js';
import { createLights } from '../foundation/src/render/lights.js';
import { createPost } from '../foundation/src/render/post.js';
import { createDayNight } from '../foundation/src/render/daynight.js';
import { createBatcher, composeMatrix } from './batch.js';
import { buildTileMap, CENTER_LAYOUT } from './tiles.js';
import { coniferPieces, roundTreePieces, lanternPieces } from './props.js';
import { buildAvatar, makeLabel } from './avatar.js';
// [公開版] JSON の import attributes は古い iOS Safari で未対応のため fetch で読む。
const BLUEPRINTS = await (await fetch('./src/avatar-blueprints.json')).json();
import { createBoard, boardFramePieces } from './board.js';
import { SAMPLE_POSTS } from './board-data.js';
import { PortalTransit, buildPortalVisual, createFader } from './portal.js';
import { buildCyberSpace } from './cyber.js';
import { buildRoom } from './room.js';
import { ROOM_DEFS } from './rooms-data.js';

const params = new URLSearchParams(location.search);
const QUALITY = params.get('quality') || 'med'; // [公開版] 実機前提で med を初期値に
const NIGHT0 = params.get('night') === '1';
const POSE = params.get('pose') || 'play'; // [公開版] 既定はスティックで歩けるプレイモード
const CAM = params.get('cam') || 'main';

state.seed = 7;
state.traveller.x = 0; state.traveller.z = 0;

// ---------------------------------------------------------------- boot
const canvas = document.getElementById('atlas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / Math.max(1, innerHeight), 0.5, 160);
const rendererApi = createRenderer({ canvas, quality: QUALITY });
const { renderer, setSize: setRendererSize } = rendererApi;
const materials = createMaterials({ quality: QUALITY });
const lights = createLights({ scene, quality: QUALITY });
const post = createPost({ renderer, scene, camera, quality: QUALITY });
const daynight = createDayNight({ scene, night: NIGHT0 });
daynight.set(NIGHT0 ? 1 : 0, true);

const P = (opts) => materials.paper(opts);

// ---------------------------------------------------------------- helpers
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
/** batcher.add with a base transform (for grouped props like pillars / portals / board frame) */
function put(batcher, base, geo, mat, x, y, z, o = {}) {
  const local = composeMatrix(x, y, z, o);
  batcher.add(geo, mat, new THREE.Matrix4().multiplyMatrices(base, local), o.opts || {});
}
const baseAt = (x, z, ry = 0) => composeMatrix(x, 0, z, { ry });

// ---------------------------------------------------------------- palette (D-Planet paper)
// MAT = plain meshes (avatars / labels / dynamic), BMAT = BatchedMesh variant of the same look.
// (foundation materials.js: plain Mesh and BatchedMesh must not share one material instance.)
const PALETTE = {
  page: { color: '#e2c491' }, plaza: { color: '#f2e3c4' }, path: { color: '#e8d3ac' },
  quadTerra: { color: '#dda184' }, quadOchre: { color: '#e8c88a' }, quadSage: { color: '#bcc39a' }, quadTeal: { color: '#a8c8c2' },
  cream: { color: '#f7ecd2' }, shade: { color: '#e8d3ac' }, rust: { color: '#b25a3b' }, terra: { color: '#c06a44' },
  gold: { color: '#d9a441' }, goldLight: { color: '#e9bc55' },
  pine: { color: '#4f6b4a' }, pineDark: { color: '#3c5a44' }, sage: { color: '#8e9a5b' }, olive: { color: '#7d8a4e' },
  trunk: { color: '#5a3a28' }, stone: { color: '#cfc4ae' }, hillFar: { color: '#38543f' },
  dGreen: { color: '#4f8a52', emissive: '#0a4d2c' }, ringGlow: { color: '#d9a441', emissive: '#4a2f08' },
  lanternGlow: { color: '#f7c873', emissive: '#7a4a12' },
  portal: { color: '#5e9c9a' }, portalGlow: { color: '#9fd8cf', emissive: '#083f36' },
};
const MAT = {}, BMAT = {};
for (const [k, def] of Object.entries(PALETTE)) { MAT[k] = P(def); BMAT[k] = P({ ...def, variant: 'dpb' }); }
for (const set of [MAT, BMAT]) {
  set.path.polygonOffset = true; set.path.polygonOffsetFactor = -2;
  for (const m of [set.quadTerra, set.quadOchre, set.quadSage, set.quadTeal]) { m.polygonOffset = true; m.polygonOffsetFactor = -1; }
}
const coreMat = P({ color: '#9fd8cf', emissive: '#083f36', emissiveIntensity: 1 });

// ================================================================ CENTER SPACE
const centerGroup = new THREE.Group(); scene.add(centerGroup);
const batcher = createBatcher();

// ---- ground: page slab + tile map + medicine-wheel disc
batcher.addAt(box(48, 0.44, 48), BMAT.page, 0, -0.28, 0, {}, { cast: false });
buildTileMap(batcher, CENTER_LAYOUT, { sheet: BMAT.page, path: BMAT.path });
batcher.addAt(cyl(15, 15.5, 0.36, 48), BMAT.plaza, 0, -0.18, 0, {}, { cast: false });
{
  const band = new THREE.RingGeometry(13.1, 14.9, 48);
  batcher.add(band, BMAT.sage, composeMatrix(0, 0.006, 0, { rx: -Math.PI / 2 }), { cast: false });
  const quads = [BMAT.quadTerra, BMAT.quadOchre, BMAT.quadTeal, BMAT.quadSage];
  for (let i = 0; i < 4; i++) {
    const q = new THREE.RingGeometry(4.0, 6.6, 24, 1, i * Math.PI / 2, Math.PI / 2);
    batcher.add(q, quads[i], composeMatrix(0, 0.010, 0, { rx: -Math.PI / 2 }), { cast: false });
  }
  batcher.addAt(cyl(3.9, 3.9, 0.03, 40), BMAT.path, 0, 0.016, 0, {}, { cast: false });
}

// ---- monument: paper "D" + planet ring on a stepped pedestal
{
  batcher.addAt(cyl(3.4, 3.6, 0.3, 40), BMAT.cream, 0, 0.15, 0);
  batcher.addAt(cyl(2.8, 3.0, 0.3, 40), BMAT.shade, 0, 0.45, 0);
  batcher.addAt(cyl(2.2, 2.4, 0.3, 40), BMAT.cream, 0, 0.75, 0);
  const dShape = new THREE.Shape();
  dShape.moveTo(0, 0); dShape.lineTo(0, 3.2); dShape.lineTo(0.9, 3.2);
  dShape.quadraticCurveTo(2.15, 3.0, 2.15, 1.6);
  dShape.quadraticCurveTo(2.15, 0.2, 0.9, 0); dShape.lineTo(0, 0);
  const hole = new THREE.Path();
  hole.moveTo(0.55, 0.55); hole.lineTo(0.55, 2.65); hole.lineTo(0.82, 2.65);
  hole.quadraticCurveTo(1.55, 2.45, 1.55, 1.6);
  hole.quadraticCurveTo(1.55, 0.75, 0.82, 0.55); hole.lineTo(0.55, 0.55);
  dShape.holes.push(hole);
  const dGeo = new THREE.ExtrudeGeometry(dShape, { depth: 0.3, bevelEnabled: false });
  dGeo.translate(-1.05, 0, 0);
  batcher.add(dGeo, BMAT.rust, composeMatrix(0, 0.92, -0.20, { s: 1.07 }));
  batcher.add(dGeo, BMAT.dGreen, composeMatrix(0, 0.90, 0.02));
  const ring = new THREE.TorusGeometry(2.55, 0.13, 10, 48);
  batcher.add(ring, BMAT.ringGlow, composeMatrix(0, 2.45, 0, { rx: Math.PI / 2 - 0.38, ry: 0.15 }));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    batcher.addAt(new THREE.OctahedronGeometry(0.16), BMAT.goldLight, Math.cos(a) * 2.45, 1.02, Math.sin(a) * 2.45);
  }
}

// ---- Jomon pillars (rope-pattern print)
const pillarTex = canvasTex(256, 256, (x) => {
  x.fillStyle = '#efe0c2'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(178,90,59,.75)'; x.lineWidth = 7; x.lineCap = 'round';
  for (let row = 0; row < 4; row++) {
    const y = row * 64 + 10;
    for (let i = -1; i < 5; i++) { x.beginPath(); x.moveTo(i * 64 + (row % 2) * 32, y + 34); x.lineTo(i * 64 + (row % 2) * 32 + 30, y + 4); x.stroke(); }
  }
  x.strokeStyle = '#5a3a28'; x.lineWidth = 6;
  for (const [cx, cy] of [[64, 96], [192, 224]]) {
    for (let r = 26; r > 5; r -= 7) { x.beginPath(); x.arc(cx, cy, r, 0.4, Math.PI * 1.75); x.stroke(); }
  }
  x.fillStyle = '#b25a3b'; x.fillRect(0, 0, 256, 12); x.fillRect(0, 244, 256, 12);
});
pillarTex.wrapS = pillarTex.wrapT = THREE.RepeatWrapping; pillarTex.repeat.set(1, 2);
const pillarMatB = P({ map: pillarTex, color: '#ffffff', variant: 'dpb' });
for (const [px, pz, ry] of [[7.1, 7.1, 0.4], [-7.1, 7.1, -0.3], [7.1, -7.1, 0.9], [-7.1, -7.1, 0.1]]) {
  const base = baseAt(px, pz, ry);
  put(batcher, base, box(0.98, 0.26, 0.98), BMAT.stone, 0, 0.13, 0);
  put(batcher, base, box(0.74, 2.5, 0.74), pillarMatB, 0, 1.5, 0);
  put(batcher, base, box(0.98, 0.24, 0.98), BMAT.rust, 0, 2.86, 0);
}

// ---- paper trees
{
  const spots = [
    [11.5, 3.5, 'c', 1.15], [12.3, -2.5, 'r', 1.2], [10.8, -8.5, 'c', 0.95], [6.5, -11.8, 'r', 1.05],
    [-3.5, -12.6, 'c', 1.25], [-9.8, -9.6, 'r', 0.9], [-12.6, -3.0, 'c', 1.1], [-12.2, 4.2, 'r', 1.15],
    [-10.5, 9.8, 'c', 0.9], [-5.2, 12.4, 'r', 1.0], [3.8, 12.6, 'c', 1.05], [9.6, 10.4, 'r', 0.95],
    [4.6, -6.4, 'c', 0.8], [-5.8, -5.4, 'r', 0.85],
  ];
  for (const [x, z, k, s] of spots) {
    const ry = (x * 7 + z * 13) % 3;
    if (k === 'c') coniferPieces(batcher, BMAT, x, z, ry, s); else roundTreePieces(batcher, BMAT, x, z, ry, s);
  }
}

// ---- bulletin board: frame batched, printed face dynamic (page flips)
const boardBase = baseAt(8.8, 3.4, 0.45);
boardFramePieces(batcher, { trunk: BMAT.trunk, terra: BMAT.terra, rust: BMAT.rust }, boardBase);
const board = createBoard({ paper: P, posts: SAMPLE_POSTS });
board.group.position.set(8.8, 0, 3.4); board.group.rotation.y = 0.45;
centerGroup.add(board.group);
if (params.get('boardpage')) board.snapTo(parseInt(params.get('boardpage'), 10) || 0);

// ---- portals (2 in the centre, both lead to the cyber centre)
const portalCores = [];
function addPortal(id, spaceId, targetSpaceId, x, z, ry) {
  const base = baseAt(x, z, ry);
  const vis = buildPortalVisual({ batcher, mats: BMAT, coreMaterial: coreMat, baseMatrix: base });
  centerGroup.add(vis.group); // NOTE: for cyber portal the group is added by cyber builder instead
  PortalTransit.register({ id, spaceId, targetSpaceId, core: vis.core });
  portalCores.push(vis.core);
  return vis;
}
addPortal('portal-center-west', 'center', 'cyber', -7.4, 6.6, 1.05);
addPortal('portal-center-east', 'center', 'cyber', 9.9, -4.6, -0.7);
addPortal('portal-center-kambo', 'center', 'kambo', 0.5, 12.4, Math.PI);

// ---- lanterns + merged light pools
const poolTex = canvasTex(128, 128, (x) => {
  const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
}, false);
function mergedPools(positions, colorHex) {
  const geos = positions.map(({ x, z }) => {
    const g = new THREE.CircleGeometry(1.8, 24);
    g.applyMatrix4(composeMatrix(x, 0.03, z, { rx: -Math.PI / 2 }));
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false),
    new THREE.MeshBasicMaterial({ map: poolTex, color: colorHex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.renderOrder = 3;
  return mesh;
}
const centerPoolPos = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.26, x = Math.cos(a) * 7.6, z = Math.sin(a) * 7.6;
  lanternPieces(batcher, BMAT, x, z, BMAT.lanternGlow);
  centerPoolPos.push({ x, z });
}
const centerPools = mergedPools(centerPoolPos, '#ff9c3f');
centerGroup.add(centerPools);

// ---- distant paper hills + moon
{
  const hills = [[30, -18, 9, 4.6], [-33, -12, 11, 5.4], [-24, 24, 8, 3.8], [26, 22, 10, 4.4], [2, -38, 12, 5.8], [-38, 6, 7, 3.4], [38, 4, 8, 4.0]];
  for (const [x, z, r, h] of hills) {
    batcher.add(new THREE.ConeGeometry(r, h, 7), BMAT.hillFar, composeMatrix(x, h / 2 - 0.3, z, { sz: 0.55 }), { cast: false });
  }
  coniferPieces(batcher, BMAT, 20, -24, 0.4, 2.0, true);
  roundTreePieces(batcher, BMAT, -19, -26, 1.1, 1.9);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshBasicMaterial({ color: '#f3e5bd' }));
  moon.position.set(-21, 15.5, -36); moon.lookAt(0, 2, 0); centerGroup.add(moon);
}

// ---- scatter: stones, grass, flowers (all batched)
{
  const rand = rng(1234);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2, r = 8.5 + rand() * 5.5;
    batcher.add(new THREE.DodecahedronGeometry(0.16 + rand() * 0.22), BMAT.stone,
      composeMatrix(Math.cos(a) * r, 0.08, Math.sin(a) * r, { rx: rand() * 3, ry: rand() * 3, sy: 0.6 }));
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = 4.5 + rand() * 10;
    if (Math.abs(Math.sin(a)) < 0.1 || Math.abs(Math.cos(a)) < 0.1) continue;
    batcher.add(new THREE.ConeGeometry(0.17, 0.42 + rand() * 0.25, 5), rand() > 0.5 ? BMAT.sage : BMAT.olive,
      composeMatrix(Math.cos(a) * r, 0.2, Math.sin(a) * r, { sz: 0.5 }), { cast: false });
  }
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2, r = 5 + rand() * 8, x = Math.cos(a) * r, z = Math.sin(a) * r;
    batcher.addAt(cyl(0.02, 0.02, 0.3, 5), BMAT.pine, x, 0.15, z, {}, { cast: false });
    batcher.add(new THREE.CircleGeometry(0.085, 10), rand() > 0.5 ? BMAT.quadTerra : BMAT.goldLight,
      composeMatrix(x, 0.32, z + 0.1, { rx: -0.5 }), { cast: false });
  }
}
batcher.build(centerGroup);

// ---- fireflies (cyber + warm), centre space only
let fireflies, fireflySeeds;
{
  const N = 42, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seeds = [];
  const rand = rng(777), cG = new THREE.Color('#8dffb0'), cA = new THREE.Color('#ffd9a0');
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2, r = 3 + rand() * 10.5;
    pos.set([Math.cos(a) * r, 0.5 + rand() * 2.6, Math.sin(a) * r], i * 3);
    const c = rand() > 0.45 ? cG : cA; col.set([c.r, c.g, c.b], i * 3);
    seeds.push({ a, r, h: pos[i * 3 + 1], s: 0.4 + rand() * 0.9, p: rand() * 9 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = canvasTex(64, 64, (x) => {
    const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  }, false);
  fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.16, map: dot, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  fireflies.frustumCulled = false;
  fireflySeeds = seeds;
  centerGroup.add(fireflies);
}

// ================================================================ CYBER SPACE
const cyber = buildCyberSpace({ paper: P, mats: BMAT, coreMaterial: coreMat });
const cyberGroup = cyber.group;
scene.add(cyberGroup);
PortalTransit.register({ id: 'portal-cyber-back', spaceId: 'cyber', targetSpaceId: 'center', core: cyber.portalCore });
portalCores.push(cyber.portalCore);
const cyberPools = mergedPools(cyber.pools, '#57e6a9');
cyberGroup.add(cyberPools);
const cyberLight = new THREE.PointLight('#57e6a9', 0, 22, 0.8);
cyberLight.position.set(0, 4.5, 0);
cyberGroup.add(cyberLight);

// ================================================================ CLUB ROOMS （ステップ6）
// 部室は部屋定義データ（rooms-data.js）から汎用ビルダーで組み立てる。
// 部屋ごとのコードは書かない — 定義を足せば部屋が増える。
const roomSpaces = {};
for (const def of ROOM_DEFS) {
  const built = buildRoom(def, { paper: P, mats: BMAT, coreMaterial: coreMat });
  scene.add(built.group);
  roomSpaces[def.id] = built;
  for (const p of built.portals) {
    PortalTransit.register({ id: p.id, spaceId: def.id, targetSpaceId: p.targetSpaceId, core: p.core });
    portalCores.push(p.core);
  }
}

// boards live per space now (centre plaza board + each room's own board)
const boards = { center: board };
for (const [id, built] of Object.entries(roomSpaces)) if (built.board) boards[id] = built.board;
if (params.get('boardpage')) {
  const n = parseInt(params.get('boardpage'), 10) || 0;
  for (const b of Object.values(boards)) b.snapTo(n);
}
const activeBoard = () => boards[currentSpace] || null;

// ================================================================ spaces + transit
const spaces = {
  center: {
    name: 'センター広場', group: centerGroup,
    spawns: [{ x: 2.6, z: 4.6, ry: 0.42 }, { x: -2.9, z: 3.6, ry: 0.55 }, { x: 5.6, z: 2.0, ry: 0.1 }],
  },
  cyber: {
    name: 'サイバーセンター', group: cyberGroup,
    spawns: [{ x: 0, z: -8.4, ry: 0 }, { x: -2.4, z: -8.0, ry: 0.5 }, { x: 2.4, z: -8.0, ry: -0.5 }],
  },
};
for (const [id, built] of Object.entries(roomSpaces)) {
  spaces[id] = {
    name: built.name, group: built.group, spawns: built.spawns,
    poolsMesh: built.poolsMesh, warmLight: built.warmLight,
  };
}
let currentSpace = spaces[params.get('space')] ? params.get('space') : 'center';
const hudEl = document.getElementById('hud');

// ---------------------------------------------------------------- avatars （設計図から組み立て）
const avatarCtx = { paper: P };
const avatarList = BLUEPRINTS.avatars.map((bp) => {
  const av = buildAvatar(bp, avatarCtx);
  scene.add(av.group);
  const label = makeLabel(av.bp, avatarCtx);
  scene.add(label);
  return { av, label };
});
const avatars = { myun: avatarList[0].av, asahi: avatarList[1].av, yuko: avatarList[2].av };
function placeAvatars(spawns) {
  avatarList.forEach(({ av }, i) => {
    const s = spawns[i % spawns.length];
    av.group.position.set(s.x, 0, s.z);
    av.group.rotation.y = s.ry;
  });
}
function applySpace(id) {
  for (const [k, s] of Object.entries(spaces)) s.group.visible = k === id;
  currentSpace = id;
  placeAvatars(spaces[id].spawns);
  window.__board = boards[id] || null;
  updateHud();
}
applySpace(currentSpace);
if (POSE === 'gate' && currentSpace === 'center') {
  const a = avatars.myun; a.armR.rotation.z = 2.35; a.legL.rotation.x = 0.18; a.legR.rotation.x = -0.14;
  avatars.asahi.armR.rotation.x = -0.55;
  avatars.yuko.armL.rotation.z = -0.45;
}
function poseWalk(a, phase, amp = 1) {
  a.legL.rotation.x = Math.sin(phase) * 0.55 * amp;
  a.legR.rotation.x = Math.sin(phase + Math.PI) * 0.55 * amp;
  a.armL.rotation.x = Math.sin(phase + Math.PI) * 0.38 * amp;
  a.armR.rotation.x = Math.sin(phase) * 0.38 * amp;
}

// transit: the app layer subscribes to PortalTransit; here the stub swaps space visibility.
const fader = createFader(document.getElementById('fade'));
let transiting = false;
async function doTransit(portalId) {
  const def = PortalTransit.get(portalId);
  if (!def || transiting || def.spaceId !== currentSpace) return;
  transiting = true;
  const from = currentSpace, to = def.targetSpaceId;
  await fader.run(() => applySpace(to));
  if (POSE === 'play') { const p = avatars.myun.group.position; camCtl.tx = p.x; camCtl.tz = p.z; }
  PortalTransit.emit({ portalId, from, to });
  transiting = false;
}
PortalTransit.transit = doTransit;
window.__transit = doTransit;

// ---------------------------------------------------------------- camera rig + input
const camCtl = { az: 0.42, pitch: 0.99, dist: 33, tx: 0, ty: 0.7, tz: 0.8 };
if (CAM === 'close') { camCtl.az = 0.5; camCtl.pitch = 0.42; camCtl.dist = 6.8; camCtl.tx = 2.6; camCtl.ty = 1.25; camCtl.tz = 4.6; }
else if (CAM === 'board') { camCtl.az = 0.45; camCtl.pitch = 0.24; camCtl.dist = 9.5; camCtl.tx = 8.8; camCtl.ty = 1.7; camCtl.tz = 3.4; }
else if (CAM === 'portal') { camCtl.az = 1.05; camCtl.pitch = 0.38; camCtl.dist = 7.5; camCtl.tx = -7.4; camCtl.ty = 1.7; camCtl.tz = 6.6; }
else if (CAM === 'portal2') { camCtl.az = -0.7; camCtl.pitch = 0.34; camCtl.dist = 8.0; camCtl.tx = 9.9; camCtl.ty = 1.7; camCtl.tz = -4.6; }
else if (CAM === 'portal3') { camCtl.az = Math.PI; camCtl.pitch = 0.38; camCtl.dist = 11.5; camCtl.tx = 0.5; camCtl.ty = 1.7; camCtl.tz = 12.4; }
else if (CAM === 'room') { camCtl.az = 0.42; camCtl.pitch = 0.99; camCtl.dist = 30; camCtl.tx = 0; camCtl.ty = 0.7; camCtl.tz = 0.8; }
else if (CAM === 'roomboard') { camCtl.az = -0.83; camCtl.pitch = 0.24; camCtl.dist = 9.5; camCtl.tx = 7.2; camCtl.ty = 1.7; camCtl.tz = -6.5; }
else if (CAM === 'roomclose') { camCtl.az = 0.6; camCtl.pitch = 0.62; camCtl.dist = 11; camCtl.tx = 0; camCtl.ty = 0.9; camCtl.tz = 0; }
else if (CAM === 'roomsign') { camCtl.az = 0.35; camCtl.pitch = 0.3; camCtl.dist = 8.5; camCtl.tx = -4.1; camCtl.ty = 1.5; camCtl.tz = 10.3; }
else camera.fov = 54, camera.updateProjectionMatrix();
if (POSE === 'play' && CAM === 'main') { camCtl.dist = 14; camCtl.pitch = 0.82; } // [公開版] 歩行用に寄せた初期カメラ
if (POSE === 'play') { const p = avatars.myun.group.position; camCtl.tx = p.x; camCtl.tz = p.z; camCtl.ty = 1.1; } // [公開版] 初期ターゲットをプレイヤー位置へ
function updateHud() {
  hudEl.textContent = `D-Planet〜紙の星〜（テスト公開） ${spaces[currentSpace].name}\n左下スティック: 歩く ・ ドラッグ: 見回す ・ ポータルに近づくと移動`;
}
updateHud();
if (params.get('hud') === '0') hudEl.style.display = 'none';
let dragging = false, lx = 0, ly = 0, moved = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; moved = 0; });
addEventListener('pointerup', (e) => {
  if (dragging && moved < 6) { // tap: portal cores are transit triggers
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const cores = PortalTransit.inSpace(currentSpace).map((p) => p.core);
    const hit = ray.intersectObjects(cores, false)[0];
    if (hit) {
      const def = [...PortalTransit.portals.values()].find((p) => p.core === hit.object);
      if (def) doTransit(def.id);
    }
  }
  dragging = false;
});
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
  camCtl.az -= (e.clientX - lx) * 0.005; camCtl.pitch = THREE.MathUtils.clamp(camCtl.pitch + (e.clientY - ly) * 0.004, 0.25, 1.35);
  lx = e.clientX; ly = e.clientY;
});
addEventListener('wheel', (e) => { camCtl.dist = THREE.MathUtils.clamp(camCtl.dist + e.deltaY * 0.02, 5, 45); }, { passive: true });
let nightTarget = NIGHT0 ? 1 : 0, nightMix = nightTarget;
addEventListener('keydown', (e) => {
  if (e.code === 'KeyN') { const n = daynight.toggle(); nightTarget = n ? 1 : 0; }
  else if (e.code === 'KeyB') { const b = activeBoard(); if (b) b.nextPage(); }
  else if (e.code === 'KeyV') { const b = activeBoard(); if (b) b.prevPage(); }
  else if (e.code === 'KeyT') { const p = PortalTransit.inSpace(currentSpace)[0]; if (p) doTransit(p.id); }
});

// ================================================================ [公開版] タッチ操作 UI
// 左下スティックで歩く / 右下ボタンで 昼夜・ポータル・掲示板。PC は WASD・矢印でも歩ける。
const joyVec = { x: 0, y: 0 };
const moveKeys = {};
addEventListener('keydown', (e) => { moveKeys[e.code] = true; });
addEventListener('keyup', (e) => { moveKeys[e.code] = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
addEventListener('pointercancel', () => { dragging = false; resetJoy(); });
const hintEl = document.getElementById('hint');
let hintHidden = false;
function hideHint() { if (!hintHidden && hintEl) { hintHidden = true; hintEl.classList.add('hide'); } }
setTimeout(hideHint, 9000);
const joyEl = document.getElementById('joy');
const stickEl = document.getElementById('stick');
let joyId = null;
function resetJoy() {
  joyId = null; joyVec.x = 0; joyVec.y = 0;
  if (stickEl) stickEl.style.transform = 'translate(-50%,-50%)';
}
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
  const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
  joyVec.x = dx; joyVec.y = dy;
  stickEl.style.transform = `translate(calc(-50% + ${dx * 32}px), calc(-50% + ${dy * 32}px))`;
}
if (joyEl) {
  joyEl.addEventListener('pointerdown', (e) => { joyId = e.pointerId; try { joyEl.setPointerCapture(joyId); } catch (_) { /* 合成イベント等では掴めないことがある */ } moveJoy(e); hideHint(); e.preventDefault(); });
  joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
  joyEl.addEventListener('pointerup', (e) => { if (e.pointerId === joyId) resetJoy(); });
  joyEl.addEventListener('pointercancel', resetJoy);
}
function onBtn(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
}
onBtn('btnNight', () => { const n = daynight.toggle(); nightTarget = n ? 1 : 0; hideHint(); });
onBtn('btnPortal', () => { const p = PortalTransit.inSpace(currentSpace)[0]; if (p) doTransit(p.id); hideHint(); });
onBtn('btnBoardNext', () => { const b = activeBoard(); if (b) b.nextPage(); });
onBtn('btnBoardPrev', () => { const b = activeBoard(); if (b) b.prevPage(); });

// [公開版] プレイヤー（みゅん）の移動状態。空間ごとの移動可能範囲（タイル外周の内側）。
const PLAY_BOUNDS = { center: 19.5, cyber: 13, kambo: 13, hape: 13 };
const playerCtl = { phase: 0, portalArmed: true };
const _coreWp = new THREE.Vector3();
function updatePlayer(dt) {
  let ix = joyVec.x, iz = joyVec.y;
  if (moveKeys['KeyW'] || moveKeys['ArrowUp']) iz -= 1;
  if (moveKeys['KeyS'] || moveKeys['ArrowDown']) iz += 1;
  if (moveKeys['KeyD'] || moveKeys['ArrowRight']) ix += 1;
  if (moveKeys['KeyA'] || moveKeys['ArrowLeft']) ix -= 1;
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const a = avatars.myun;
  if (len > 0.12) {
    const sin = Math.sin(camCtl.az), cos = Math.cos(camCtl.az);
    const mx = sin * iz + cos * ix;   // 画面奥方向 = カメラ前方 (-sin,-cos) × 前進量(-iz)
    const mz = cos * iz - sin * ix;
    const sp = 4.4 * dt;
    a.group.position.x += mx * sp;
    a.group.position.z += mz * sp;
    const B = PLAY_BOUNDS[currentSpace] ?? 19.5;
    a.group.position.x = THREE.MathUtils.clamp(a.group.position.x, -B, B);
    a.group.position.z = THREE.MathUtils.clamp(a.group.position.z, -B, B);
    a.group.rotation.y = Math.atan2(mx, mz);
    playerCtl.phase += dt * 7.4;
    poseWalk(a, playerCtl.phase);
    a.group.position.y = Math.abs(Math.sin(playerCtl.phase)) * 0.045;
  } else {
    poseWalk(a, 0, 0);
    a.group.position.y = Math.sin(t * 1.4) * 0.012;
  }
  // カメラはプレイヤーへ滑らかに追従し、DoF の焦点も合わせる
  const tp = a.group.position;
  const k = Math.min(1, dt * 3.5);
  camCtl.tx += (tp.x - camCtl.tx) * k;
  camCtl.tz += (tp.z - camCtl.tz) * k;
  camCtl.ty += (1.1 - camCtl.ty) * k;
  focusPoint.set(tp.x, 1.2, tp.z);
  // ポータル接近で遷移（到着直後は再アームするまで発火しない）
  if (!transiting) {
    let nearAny = false;
    for (const def of PortalTransit.inSpace(currentSpace)) {
      def.core.getWorldPosition(_coreWp);
      const dx = _coreWp.x - tp.x, dz = _coreWp.z - tp.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.9 * 2.9) nearAny = true;
      if (playerCtl.portalArmed && d2 < 1.7 * 1.7) { playerCtl.portalArmed = false; doTransit(def.id); break; }
    }
    if (!nearAny) playerCtl.portalArmed = true;
  }
  // ほかの住人の ambient
  avatars.asahi.armR.rotation.x = -0.55 + Math.sin(t * 1.2) * 0.06;
  avatars.asahi.headG.rotation.y = Math.sin(t * 0.5) * 0.14;
  avatars.yuko.armL.rotation.z = -0.3 + Math.sin(t * 1.6) * 0.12;
}

// Festival warm light over the front plaza (lifts avatars/board out of the blue night grade).
const festLight = new THREE.PointLight('#ffc45a', 0, 30, 0.7);
festLight.position.set(2.5, 4.5, 9.5);
scene.add(festLight);

const fakeTraveller = { position: new THREE.Vector3(0, 0, 0) };
const focusPoint = new THREE.Vector3(camCtl.tx, 1.2, camCtl.tz);
function resize() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  setRendererSize(w, h); post.setSize(w, h);
}
addEventListener('resize', resize);
resize();

window.__measure = () => {
  renderer.info.autoReset = false; renderer.info.reset();
  post.render(0);
  const out = { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
  renderer.info.autoReset = true; renderer.info.reset();
  return out;
};
window.__sceneStats = () => {
  renderer.info.autoReset = false; renderer.info.reset();
  renderer.render(scene, camera);
  const out = { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
  renderer.info.autoReset = true; renderer.info.reset();
  return out;
};
window.__ready = false;
window.__player = () => avatars.myun.group.position.toArray(); // [公開版] 検証用フック（__measure 等と同列）

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let t = 0;
// [公開版] ローディング消去と適応品質（明示指定がない時だけ、開始6秒後から計測）
let loadingHidden = false, fpsAcc = 0, fpsN = 0, fpsStage = 0;
const ADAPTIVE = !params.get('quality');
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  nightMix += (nightTarget - nightMix) * Math.min(1, dt * 2.2);

  if (POSE === 'play') {
    updatePlayer(dt);
  } else if (POSE === 'walk') {
    const a = avatars.myun, ang = t * 0.16;
    a.group.position.set(Math.sin(ang) * 5.4, 0, Math.cos(ang) * 5.4);
    a.group.rotation.y = ang + Math.PI / 2;
    poseWalk(a, t * 5.4);
    a.group.position.y = Math.abs(Math.sin(t * 5.4)) * 0.045;
    avatars.asahi.armR.rotation.x = -0.55 + Math.sin(t * 1.2) * 0.06;
    avatars.asahi.headG.rotation.y = Math.sin(t * 0.5) * 0.14;
    avatars.yuko.armL.rotation.z = -0.3 + Math.sin(t * 1.6) * 0.12;
    avatars.yuko.group.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02;
  } else {
    avatars.myun.armR.rotation.z = 2.35 + Math.sin(t * 2.4) * 0.13;
    for (const { av } of avatarList) av.group.position.y = Math.sin(t * 1.4 + av.phase) * 0.012;
  }
  for (const { av, label } of avatarList) {
    const p = av.group.position;
    label.position.set(p.x, p.y + 2.56 * av.bp.scale, p.z);
    label.rotation.set(0, Math.atan2(camera.position.x - p.x, camera.position.z - p.z), Math.sin(t * 1.3 + av.phase) * 0.03);
  }
  { const ab = activeBoard(); if (ab) ab.update(dt); }
  coreMat.emissiveIntensity = 1 + Math.sin(t * 2.2) * 0.3;
  if (currentSpace === 'center') {
    const pos = fireflies.geometry.attributes.position;
    for (let i = 0; i < fireflySeeds.length; i++) {
      const s = fireflySeeds[i], a = s.a + t * 0.05 * s.s;
      pos.setXYZ(i, Math.cos(a) * s.r, s.h + Math.sin(t * s.s + s.p) * 0.35, Math.sin(a) * s.r);
    }
    pos.needsUpdate = true;
    fireflies.material.opacity = nightMix * (0.75 + 0.25 * Math.sin(t * 2.7));
  }
  centerPools.material.opacity = nightMix * 0.5;
  cyberPools.material.opacity = nightMix * 0.55;
  festLight.intensity = nightMix * 3.4 * (currentSpace === 'center' ? 1 : 0);
  cyberLight.intensity = nightMix * 2.2;
  for (const s of Object.values(spaces)) {
    if (s.poolsMesh) s.poolsMesh.material.opacity = nightMix * 0.5;
    if (s.warmLight) s.warmLight.intensity = nightMix * 3.0;
  }

  const cp = Math.cos(camCtl.pitch), sp = Math.sin(camCtl.pitch);
  camera.position.set(
    camCtl.tx + Math.sin(camCtl.az) * cp * camCtl.dist,
    camCtl.ty + sp * camCtl.dist,
    camCtl.tz + Math.cos(camCtl.az) * cp * camCtl.dist);
  camera.lookAt(camCtl.tx, camCtl.ty, camCtl.tz);

  daynight.update(dt);
  lights.update(dt, fakeTraveller, camera);
  materials.update(dt);
  post.setFocus(focusPoint);
  post.render(dt);
  window.__ready = true;
  if (!loadingHidden) { loadingHidden = true; document.getElementById('loading')?.classList.add('done'); }
  if (ADAPTIVE && t > 6) {
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 3) {
      const avg = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (avg < 45 && fpsStage === 0) { fpsStage = 1; rendererApi.setQuality('low'); resize(); }
      else if (avg < 28 && fpsStage === 1) {
        fpsStage = 2;
        renderer.setPixelRatio(0.75);
        renderer.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight), false);
        post.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight));
      }
    }
  }
}
frame();
