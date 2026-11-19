// room.js — 部室の汎用ビルダー（ステップ6）。
// 部室は「有限の紙ページ」として、ステップ4のフレーム（タイル MAP データ＋紙パーツ＋
// batcher＋掲示板印刷＋PortalTransit）だけで組み立てる。新しいエンジン機能は足さない。
//
// ここがプラットフォーム原則（計画 §7.5）の実装上の核:
//   部屋の中身は rooms-data.js の「部屋定義データ」だけで決まる。このビルダーは
//   定義を解釈するだけの汎用コードで、部屋ごとの分岐は持たない。
//   → 定義データを差し替えるだけで別の部室になる（2室目のスケルトンで実証）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBatcher, composeMatrix } from './batch.js';
import { buildTileMap, TILE_SIZE } from './tiles.js';
import { coniferPieces, roundTreePieces, lanternPieces } from './props.js';
import { createBoard, boardFramePieces } from './board.js';
import { buildPortalVisual } from './portal.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** batcher.add with a base transform (same helper shape as main.js) */
function put(batcher, base, geo, mat, x, y, z, o = {}) {
  const local = composeMatrix(x, y, z, o);
  batcher.add(geo, mat, new THREE.Matrix4().multiplyMatrices(base, local), o.opts || {});
}
const baseAt = (x, z, ry = 0) => composeMatrix(x, 0, z, { ry });

// radial light-pool texture (same recipe as the centre plaza pools)
const poolTex = canvasTex(128, 128, (x) => {
  const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
});
function poolsMesh(positions, colorHex) {
  if (!positions.length) return null;
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

/**
 * Build one club room from its definition data.
 * ctx = { paper, mats (global batched palette BMAT), coreMaterial }
 * Returns { group, board|null, portals: [{id, targetSpaceId, core}], poolsMesh, warmLight, name, spawns }.
 */
export function buildRoom(def, ctx) {
  const { paper, mats, coreMaterial } = ctx;
  const group = new THREE.Group();
  const batcher = createBatcher();
  const B = (opts) => paper({ ...opts, variant: 'dpb' });
  const pal = def.palette;
  const RM = {
    sheet: B({ color: pal.sheet }), path: B({ color: pal.path }), slab: B({ color: pal.slab }),
    wall: B({ color: pal.wall }), wallCap: B({ color: pal.wallCap }), disc: B({ color: pal.disc }),
  };
  RM.disc.polygonOffset = true; RM.disc.polygonOffsetFactor = -1;
  const rows = def.layout.length, cols = def.layout[0].length;
  const W = cols * TILE_SIZE, D = rows * TILE_SIZE;
  const poolPos = [];

  // ---- ground: finite paper page (slab) + tile map from the definition's grid
  batcher.addAt(box(W + 8, 0.44, D + 8), RM.slab, 0, -0.28, 0, {}, { cast: false });
  buildTileMap(batcher, def.layout, { sheet: RM.sheet, path: RM.path });

  // ---- perimeter: low paper wall with gates (the "room" boundary of the finite page)
  const gaps = new Set((def.wallGaps || []).map((g) => g.side + ':' + g.index));
  const wallH = 1.15;
  function gatePosts(side, along) {
    // two posts + a beam across the gap, in wall-run coordinates
    let px, pz, ry;
    if (side === 'N') { px = along; pz = -D / 2 - 0.45; ry = 0; }
    else if (side === 'S') { px = along; pz = D / 2 + 0.45; ry = 0; }
    else if (side === 'W') { px = -W / 2 - 0.45; pz = along; ry = Math.PI / 2; }
    else { px = W / 2 + 0.45; pz = along; ry = Math.PI / 2; }
    const base = baseAt(px, pz, ry);
    put(batcher, base, box(0.34, 2.3, 0.34), RM.wallCap, -2.7, 1.15, 0);
    put(batcher, base, box(0.34, 2.3, 0.34), RM.wallCap, 2.7, 1.15, 0);
    put(batcher, base, box(6.0, 0.3, 0.44), RM.wallCap, 0, 2.42, 0);
  }
  function wallRun(side) {
    const n = (side === 'N' || side === 'S') ? cols : rows;
    for (let i = 0; i < n; i++) {
      const along = -((n - 1) * TILE_SIZE) / 2 + i * TILE_SIZE;
      if (gaps.has(side + ':' + i)) { gatePosts(side, along); continue; }
      let x, z, ry = 0;
      if (side === 'N') { x = along; z = -D / 2 - 0.45; }
      else if (side === 'S') { x = along; z = D / 2 + 0.45; }
      else if (side === 'W') { x = -W / 2 - 0.45; z = along; ry = Math.PI / 2; }
      else { x = W / 2 + 0.45; z = along; ry = Math.PI / 2; }
      batcher.addAt(box(TILE_SIZE, wallH, 0.3), RM.wall, x, wallH / 2, z, { ry });
      batcher.addAt(box(TILE_SIZE, 0.14, 0.46), RM.wallCap, x, wallH + 0.07, z, { ry });
    }
  }
  wallRun('N'); wallRun('S'); wallRun('W'); wallRun('E');
  for (const [cx, cz] of [[-W / 2 - 0.45, -D / 2 - 0.45], [W / 2 + 0.45, -D / 2 - 0.45], [-W / 2 - 0.45, D / 2 + 0.45], [W / 2 + 0.45, D / 2 + 0.45]]) {
    batcher.addAt(box(0.44, 1.55, 0.44), RM.wallCap, cx, 0.77, cz);
  }

  // ---- distant hills outside the page (depth cue, same recipe as the plaza)
  for (const [hx, hz, r, h] of [[-W / 2 - 13, -D / 2 - 6, 8, 4.0], [W / 2 + 12, -D / 2 - 9, 10, 5.0], [2, D / 2 + 15, 11, 5.2]]) {
    batcher.add(new THREE.ConeGeometry(r, h, 7), mats.hillFar, composeMatrix(hx, h / 2 - 0.3, hz, { sz: 0.55 }), { cast: false });
  }

  // ---- club sign (opaque paper print, per the paper-shader rule)
  if (def.sign) {
    const s = def.sign;
    const signTex = canvasTex(512, 176, (x) => {
      x.fillStyle = s.bg; x.fillRect(0, 0, 512, 176);
      x.strokeStyle = s.border; x.lineWidth = 6; x.strokeRect(9, 9, 494, 158);
      x.fillStyle = s.fg; x.textAlign = 'center';
      x.font = '700 56px "Hiragino Sans","Noto Sans JP",sans-serif'; x.textBaseline = 'middle';
      x.fillText(s.title, 256, 68);
      x.fillStyle = s.border; x.font = '400 30px "Hiragino Sans","Noto Sans JP",sans-serif';
      x.fillText(s.sub, 256, 128);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.07), paper({ map: signTex }));
    sign.position.set(s.x, 1.62, s.z); sign.rotation.y = s.ry;
    group.add(sign);
    const base = baseAt(s.x, s.z, s.ry);
    put(batcher, base, box(0.13, 1.7, 0.13), mats.trunk, -1.25, 0.85, -0.09);
    put(batcher, base, box(0.13, 1.7, 0.13), mats.trunk, 1.25, 0.85, -0.09);
  }

  // ---- club bulletin board (members-only posts, printed on paper)
  let board = null;
  if (def.board) {
    const bd = def.board;
    const base = baseAt(bd.x, bd.z, bd.ry);
    boardFramePieces(batcher, { trunk: mats.trunk, terra: mats.terra, rust: mats.rust }, base);
    board = createBoard({ paper, posts: bd.posts, title: bd.title, subtitle: bd.sub });
    board.group.position.set(bd.x, 0, bd.z);
    board.group.rotation.y = bd.ry;
    group.add(board.group);
  }

  // ---- gathering circle: disc + stump seats + centre lantern
  if (def.gathering) {
    const g = def.gathering;
    // disc top sits at y=0.035 — above the tile sheets (0.0) and path strips (0.0165);
    // coplanar with either one, the paper coverage dithers into stripes (z-fighting)
    batcher.addAt(cyl(4.6, 4.85, 0.34, 36), RM.disc, g.x, -0.135, g.z, {}, { cast: false });
    for (let i = 0; i < g.seats; i++) {
      const a = (i / g.seats) * Math.PI * 2 + 0.5;
      const sx = g.x + Math.cos(a) * 3.3, sz = g.z + Math.sin(a) * 3.3;
      batcher.addAt(cyl(0.42, 0.47, 0.44, 10), mats.stone, sx, 0.22, sz);
      batcher.addAt(cyl(0.40, 0.40, 0.10, 10), RM.wallCap, sx, 0.49, sz, {}, { cast: false });
    }
    lanternPieces(batcher, mats, g.x, g.z, mats.lanternGlow);
    poolPos.push({ x: g.x, z: g.z });
  }

  // ---- trees / lanterns / scatter from the definition lists
  for (const t of def.trees || []) {
    if (t.kind === 'round') roundTreePieces(batcher, mats, t.x, t.z, t.ry || 0, t.s || 1);
    else coniferPieces(batcher, mats, t.x, t.z, t.ry || 0, t.s || 1);
  }
  for (const l of def.lanterns || []) {
    lanternPieces(batcher, mats, l.x, l.z, mats.lanternGlow);
    poolPos.push({ x: l.x, z: l.z });
  }
  {
    const rand = rng(def.seed || 1);
    const n = def.scatter || 0;
    for (let i = 0; i < n; i++) {
      const x = (rand() * 2 - 1) * (W / 2 - 2.2), z = (rand() * 2 - 1) * (D / 2 - 2.2);
      if (def.gathering && Math.hypot(x - def.gathering.x, z - def.gathering.z) < 5.4) continue;
      if (Math.abs(x) < 1.7) continue; // keep the path clear
      if (rand() > 0.45) {
        batcher.add(new THREE.DodecahedronGeometry(0.15 + rand() * 0.2), mats.stone,
          composeMatrix(x, 0.08, z, { rx: rand() * 3, ry: rand() * 3, sy: 0.6 }));
      } else {
        batcher.add(new THREE.ConeGeometry(0.16, 0.4 + rand() * 0.25, 5), rand() > 0.5 ? mats.sage : mats.olive,
          composeMatrix(x, 0.2, z, { sz: 0.5 }), { cast: false });
      }
    }
  }

  // ---- portals (visuals batched here; transit registration is the app layer's job)
  const portals = [];
  for (const p of def.portals || []) {
    const base = baseAt(p.x, p.z, p.ry || 0);
    const vis = buildPortalVisual({ batcher, mats, coreMaterial, baseMatrix: base });
    group.add(vis.group);
    portals.push({ id: p.id, targetSpaceId: p.target, core: vis.core });
  }

  batcher.build(group);

  // ---- night dressing: merged lantern pools + one warm light over the room
  const pools = poolsMesh(poolPos, '#ff9c3f');
  if (pools) group.add(pools);
  const warmAt = def.gathering || { x: 0, z: 0 };
  const warmLight = new THREE.PointLight('#ffc45a', 0, 26, 0.7);
  warmLight.position.set(warmAt.x, 4.2, warmAt.z);
  group.add(warmLight);

  return { group, board, portals, poolsMesh: pools, warmLight, name: def.name, spawns: def.spawns || [] };
}
