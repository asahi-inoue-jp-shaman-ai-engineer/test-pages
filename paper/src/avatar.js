// avatar.js — 紙人形アバターの「JSON 設計図」ビルダ（ステップ4、あさひの設計図方式）。
//
// 狙い（将来の流れ）: 住人が自分の Muse に言葉で頼む → Muse が設計図（JSON）を書く
// → アプリがそれを読んでアバターが組み上がる。ここはその基盤（組み立てエンジン＋
// パーツレジストリ＋最小バリデーション）。組み立て UI は今回の範囲外。
//
// プラットフォーム原則（計画 §7.5）:
//   - パーツはレジストリ登録式（registerAvatarPart）。ID は名前空間つき文字列で、
//     運営パーツは `body.* / face.* / hair.* / top.* / bottom.* / equip.*`、
//     将来の住人パーツは別名前空間で追加できる前提。
//   - ルールは最低限: 型・色形式・scale の範囲だけ検証し、未知のパーツ ID は
//     既定パーツへフォールバックして「落とさない」。表現の制限はしない。
//   - 運営が用意する完成品は「公式アイテム（equip.* の一部）」と
//     「初期アバター数種類（avatar-blueprints.json）」だけ。
//
// 描画: パーツは頂点カラーで塗り分けたジオメトリを部位ごとにマージし、
// 1 部位 = 1 メッシュに抑える（ステップ4 のドローコール削減と両立）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from './batch.js';

// ------------------------------------------------------------------ registry
export const AVATAR_PARTS = new Map();
export function registerAvatarPart(id, builder) { AVATAR_PARTS.set(id, builder); }

export const DEFAULT_BLUEPRINT = {
  version: 1,
  name: 'ななし',
  parts: { body: 'body.standard', face: 'face.standard', hair: 'hair.short', top: 'top.plain', bottom: 'bottom.pants' },
  colors: { skin: '#f6cf9f', hair: '#5a4632', top: '#f3e9d2', bottom: '#8a97a5', accent: '#d9a441' },
  equipment: { neck: null, head: null, hand: null },
  label: { accent: null },
  scale: 1,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Minimal validation: fix what's structurally broken, keep everything else free. */
export function validateBlueprint(input, warn = (m) => console.warn('[avatar]', m)) {
  const bp = JSON.parse(JSON.stringify(DEFAULT_BLUEPRINT));
  if (!input || typeof input !== 'object') { warn('blueprint is not an object; using defaults'); return bp; }
  if (typeof input.name === 'string' && input.name.length > 0) bp.name = input.name.slice(0, 10); // label print safety
  for (const slot of ['body', 'face', 'hair', 'top', 'bottom']) {
    const id = input.parts && input.parts[slot];
    if (typeof id === 'string') {
      if (AVATAR_PARTS.has(id)) bp.parts[slot] = id;
      else warn(`unknown part "${id}" for ${slot}; falling back to ${bp.parts[slot]}`);
    }
  }
  for (const key of ['skin', 'hair', 'top', 'bottom', 'accent']) {
    const v = input.colors && input.colors[key];
    if (typeof v === 'string' && HEX.test(v)) bp.colors[key] = v;
    else if (v !== undefined) warn(`bad color for ${key}; keeping default`);
  }
  for (const slot of ['neck', 'head', 'hand']) {
    const id = input.equipment && input.equipment[slot];
    if (id === null || id === undefined) bp.equipment[slot] = null;
    else if (typeof id === 'string' && AVATAR_PARTS.has(id)) bp.equipment[slot] = id;
    else if (typeof id === 'string') { warn(`unknown equipment "${id}"; slot left empty`); bp.equipment[slot] = null; }
  }
  if (input.label && typeof input.label.accent === 'string' && HEX.test(input.label.accent)) bp.label.accent = input.label.accent;
  if (typeof input.scale === 'number' && Number.isFinite(input.scale)) bp.scale = Math.min(1.4, Math.max(0.7, input.scale));
  return bp;
}

// ------------------------------------------------------------------ geometry helpers
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s);
function xform(geo, x, y, z, o = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)),
    new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
  geo.applyMatrix4(m);
  return geo;
}
function mergedMesh(parts, material, cast = true) {
  const geos = parts.map(([geo, hex, x, y, z, o]) => paint(xform(geo, x, y, z, o), hex));
  const g = mergeGeometries(geos, false);
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = cast; mesh.receiveShadow = true;
  return mesh;
}

// ------------------------------------------------------------------ canvas prints (all opaque: paper shader rule)
function makeCanvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const faceCache = new Map();
function faceTexture(faceId, skin) {
  const key = faceId + '|' + skin;
  if (faceCache.has(key)) return faceCache.get(key);
  const t = makeCanvasTex(256, 256, (x) => {
    x.fillStyle = skin; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#33241a'; x.strokeStyle = '#33241a'; x.lineCap = 'round';
    if (faceId === 'face.calm') { // gentle closed eyes
      x.lineWidth = 7;
      x.beginPath(); x.arc(75, 108, 13, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
      x.beginPath(); x.arc(181, 108, 13, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
    } else {
      x.beginPath(); x.roundRect(66, 96, 18, 32, 9); x.fill();
      x.beginPath(); x.roundRect(172, 96, 18, 32, 9); x.fill();
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(72, 104, 4.5, 0, 7); x.fill();
      x.beginPath(); x.arc(178, 104, 4.5, 0, 7); x.fill();
      x.fillStyle = '#33241a';
    }
    x.lineWidth = 7; x.beginPath();
    if (faceId === 'face.smile') x.arc(128, 138, 24, Math.PI * 0.15, Math.PI * 0.85);
    else x.arc(128, 146, 18, Math.PI * 0.2, Math.PI * 0.8);
    x.stroke();
    x.fillStyle = 'rgba(232,130,110,.6)';
    x.beginPath(); x.ellipse(52, 150, 18, 11, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(204, 150, 18, 11, 0, 0, 7); x.fill();
  });
  faceCache.set(key, t);
  return t;
}
const emblemTexture = () => makeCanvasTex(128, 128, (x) => {
  x.fillStyle = '#d9a441'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#8a5a1d'; x.lineWidth = 7;
  x.beginPath(); x.arc(64, 64, 44, 0, 7); x.stroke();
  x.lineWidth = 6;
  x.beginPath(); x.moveTo(64, 28); x.lineTo(64, 100); x.moveTo(28, 64); x.lineTo(100, 64); x.stroke();
  x.fillStyle = '#b25a3b'; x.beginPath(); x.arc(64, 64, 12, 0, 7); x.fill();
});

// ------------------------------------------------------------------ part builders
// builder(rig, bp, ctx): rig = { group, legL, legR, armL, armR, headG } pivots + anchors.
// ctx = { paper } — the foundation paper-material factory.
function buildBody(rig, bp, ctx) {
  const C = bp.colors, white = ctx.paper({ color: '#ffffff' });
  for (const leg of [rig.legL, rig.legR]) { // shoes live on the leg pivots (footwear = body)
    leg.add(mergedMesh([[box(0.19, 0.09, 0.27), '#5a3a28', 0, -0.71, 0.05]], white, false));
  }
  // torso (top colour) + arms (top) with skin hands, merged per limb
  rig.group.add(mergedMesh([[box(0.58, 0.66, 0.15), C.top, 0, 1.07, 0]], white));
  for (const arm of [rig.armL, rig.armR]) {
    arm.add(mergedMesh([
      [box(0.13, 0.62, 0.09), C.top, 0, -0.29, 0],
      [new THREE.SphereGeometry(0.078, 10, 8), C.skin, 0, -0.62, 0, { sz: 0.5 }],
    ], white));
  }
  // skull (skin) — hair is a separate part layered onto headG by the hair builder
  rig.headG.add(mergedMesh([
    [new THREE.SphereGeometry(0.30, 24, 18), C.skin, 0, 0.30, 0, { sy: 1.06, sz: 0.60 }],
  ], white));
}
registerAvatarPart('body.standard', buildBody);

function facePart(faceId) {
  return (rig, bp, ctx) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.205, 24),
      ctx.paper({ map: faceTexture(faceId, bp.colors.skin) }));
    m.position.set(0, 0.28, 0.183);
    rig.headG.add(m);
  };
}
registerAvatarPart('face.standard', facePart('face.standard'));
registerAvatarPart('face.calm', facePart('face.calm'));
registerAvatarPart('face.smile', facePart('face.smile'));

function hairCap(C) {
  return [new THREE.SphereGeometry(0.318, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), C.hair, 0, 0.335, 0, { rx: -0.14, sz: 0.66 }];
}
registerAvatarPart('hair.short', (rig, bp, ctx) => {
  rig.headG.add(mergedMesh([hairCap(bp.colors)], ctx.paper({ color: '#ffffff' })));
});
registerAvatarPart('hair.long', (rig, bp, ctx) => {
  rig.headG.add(mergedMesh([
    hairCap(bp.colors),
    [box(0.52, 0.58, 0.07), bp.colors.hair, 0, 0.02, -0.17],
  ], ctx.paper({ color: '#ffffff' })));
});
registerAvatarPart('hair.bob', (rig, bp, ctx) => {
  rig.headG.add(mergedMesh([
    hairCap(bp.colors),
    [box(0.52, 0.32, 0.07), bp.colors.hair, 0, 0.15, -0.17],
  ], ctx.paper({ color: '#ffffff' })));
});
registerAvatarPart('hair.none', () => {});

registerAvatarPart('top.plain', () => {});
registerAvatarPart('top.dress', (rig, bp, ctx) => { // skirt flare in the top colour
  rig.group.add(mergedMesh([[cyl(0.33, 0.53, 0.52, 20), bp.colors.top, 0, 0.78, 0]], ctx.paper({ color: '#ffffff' })));
});
registerAvatarPart('bottom.pants', (rig, bp, ctx) => {
  for (const leg of [rig.legL, rig.legR]) {
    leg.add(mergedMesh([[box(0.17, 0.74, 0.10), bp.colors.bottom, 0, -0.37, 0]], ctx.paper({ color: '#ffffff' })));
  }
});
registerAvatarPart('bottom.skirt', (rig, bp, ctx) => {
  for (const leg of [rig.legL, rig.legR]) {
    leg.add(mergedMesh([[box(0.17, 0.44, 0.10), bp.colors.bottom, 0, -0.22, 0]], ctx.paper({ color: '#ffffff' })));
  }
  rig.group.add(mergedMesh([[cyl(0.34, 0.55, 0.4, 20), bp.colors.bottom, 0, 0.82, 0]], ctx.paper({ color: '#ffffff' })));
});

// ---- equipment slots （公式アイテムは運営提供パーツとしてここに登録される）
registerAvatarPart('equip.necklace.medal', (rig, bp, ctx) => { // 公式アイテム: 金の首飾り＋紋章メダル
  const gold = ctx.paper({ color: '#ffffff', emissive: '#3a2708' });
  const arc = new THREE.TorusGeometry(0.20, 0.032, 8, 20, Math.PI);
  const medal = cyl(0.155, 0.155, 0.04, 24);
  const g = mergeGeometries([
    paint(xform(arc, 0, 1.29, 0.13, { rz: Math.PI, rx: -0.25 }), '#d9a441'),
    paint(xform(medal, 0, 1.13, 0.14, { rx: Math.PI / 2 - 0.15 }), '#d9a441'),
  ], false);
  const mesh = new THREE.Mesh(g, gold); mesh.castShadow = false;
  rig.group.add(mesh);
  const emb = new THREE.Mesh(new THREE.CircleGeometry(0.115, 24), ctx.paper({ map: emblemTexture() }));
  emb.position.set(0, 1.135, 0.168); emb.rotation.x = -0.15;
  rig.group.add(emb);
});
registerAvatarPart('equip.halo.gold', (rig, bp, ctx) => { // 公式アイテム: 金の輪
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 28),
    ctx.paper({ color: '#e9bc55', emissive: '#4a2f08' }));
  m.position.set(0, 2.18, 0); m.rotation.x = Math.PI / 2 - 0.25;
  rig.group.add(m);
});
registerAvatarPart('equip.lantern.paper', (rig, bp, ctx) => { // 手持ち紙ランタン（右手）
  const white = ctx.paper({ color: '#ffffff' });
  const glow = ctx.paper({ color: '#f7c873', emissive: '#7a4a12' });
  const parts = mergedMesh([
    [box(0.03, 0.14, 0.03), '#5a3a28', 0, -0.59, 0.08],
    [box(0.24, 0.04, 0.24), '#b25a3b', 0, -0.62, 0.08],
  ], white, false);
  const lamp = new THREE.Mesh(paint(box(0.20, 0.24, 0.20), '#f7c873'), glow);
  lamp.position.set(0, -0.76, 0.08);
  rig.armR.add(parts, lamp);
});

// ------------------------------------------------------------------ label （吹き出し式の紙カード名札）
export function makeLabel(bp, ctx) {
  const accent = bp.label.accent || bp.colors.accent;
  const tex = makeCanvasTex(320, 176, (x) => {
    x.fillStyle = '#fffaf0'; x.fillRect(0, 0, 320, 176);
    x.strokeStyle = '#5a3a28'; x.lineWidth = 7;
    x.beginPath(); x.roundRect(7, 7, 306, 162, 20); x.stroke();
    x.fillStyle = accent; x.beginPath(); x.arc(42, 88, 11, 0, 7); x.fill();
    x.fillStyle = '#43302a';
    x.font = '700 56px "Hiragino Sans","Noto Sans JP",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(bp.name, 172, 90);
  });
  const grp = new THREE.Group();
  const cardMat = ctx.paper({ color: '#ffffff', map: tex, emissive: '#2a1e10' });
  const card = new THREE.Mesh(paint(new THREE.PlaneGeometry(1.3, 0.715), '#ffffff'), cardMat);
  grp.add(card);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(-0.09, 0); tailShape.lineTo(0.09, 0); tailShape.lineTo(0, -0.17); tailShape.lineTo(-0.09, 0);
  const tail = new THREE.Mesh(paint(new THREE.ShapeGeometry(tailShape), '#fffaf0'),
    ctx.paper({ color: '#ffffff', emissive: '#2a1e10' }));
  tail.position.y = -0.35;
  grp.add(tail);
  return grp;
}

// ------------------------------------------------------------------ assemble
export function buildAvatar(input, ctx) {
  const bp = validateBlueprint(input);
  const group = new THREE.Group();
  const rig = { group, bp };
  rig.legL = new THREE.Group(); rig.legL.position.set(-0.12, 0.74, 0); group.add(rig.legL);
  rig.legR = new THREE.Group(); rig.legR.position.set(0.12, 0.74, 0); group.add(rig.legR);
  rig.armL = new THREE.Group(); rig.armL.position.set(-0.37, 1.36, 0); group.add(rig.armL);
  rig.armR = new THREE.Group(); rig.armR.position.set(0.37, 1.36, 0); group.add(rig.armR);
  rig.headG = new THREE.Group(); rig.headG.position.y = 1.40; group.add(rig.headG);
  const run = (id) => { const b = AVATAR_PARTS.get(id); if (b) b(rig, bp, ctx); };
  run(bp.parts.body);
  run(bp.parts.bottom);
  run(bp.parts.top);
  run(bp.parts.face);
  run(bp.parts.hair);
  if (bp.equipment.neck) run(bp.equipment.neck);
  if (bp.equipment.head) run(bp.equipment.head);
  if (bp.equipment.hand) run(bp.equipment.hand);
  group.scale.setScalar(bp.scale);
  return { group, legL: rig.legL, legR: rig.legR, armL: rig.armL, armR: rig.armR, headG: rig.headG, bp, phase: Math.random() * 6 };
}
