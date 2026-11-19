// cyber.js — 第2空間「サイバーセンター」（ステップ4のポータル往復先）。
// センター広場と同じフレーム（タイル MAP データ＋紙パーツ＋batcher）で組み立てる実証:
// 空間はデータと部品の組み合わせであり、運営が作り込む対象ではないことの証明を兼ねる。
import * as THREE from 'three';
import { createBatcher } from './batch.js';
import { buildTileMap, CYBER_LAYOUT } from './tiles.js';
import { coniferPieces, lanternPieces } from './props.js';
import { buildPortalVisual } from './portal.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
const M4 = (x, y, z, ry = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));

export function buildCyberSpace({ paper, mats, coreMaterial }) {
  const group = new THREE.Group();
  const batcher = createBatcher();
  const B = (opts) => paper({ ...opts, variant: 'dpb' });
  const CM = {
    sheet: B({ color: '#3d5c49' }),
    path: B({ color: '#4a7a5e', emissive: '#0a2d1c' }),
    slab: B({ color: '#2e4638' }),
    disc: B({ color: '#46684f' }),
    ring: B({ color: '#9fd8cf', emissive: '#0b4a3a' }),
    lantern: B({ color: '#b8ffd9', emissive: '#0d5a34' }),
  };
  // ground: slab + tile map (cyber palette) + centre disc
  batcher.addAt(box(34, 0.44, 34), CM.slab, 0, -0.28, 0, {}, { cast: false });
  buildTileMap(batcher, CYBER_LAYOUT, { sheet: CM.sheet, path: CM.path });
  batcher.addAt(cyl(6.4, 6.7, 0.36, 40), CM.disc, 0, -0.18, 0, {}, { cast: false });

  // cyber tower: stacked paper boxes with a printed window grid + glowing ring + orb
  const winTex = canvasTex(256, 256, (x) => {
    x.fillStyle = '#2c4238'; x.fillRect(0, 0, 256, 256);
    const rand = rng(42);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
      if (rand() > 0.45) continue;
      x.fillStyle = rand() > 0.25 ? '#8dffb0' : '#ffd9a0';
      x.fillRect(18 + c * 38, 16 + r * 30, 20, 14);
    }
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const towerMat = B({ map: winTex, color: '#ffffff' });
  batcher.addAt(cyl(2.6, 2.8, 0.3, 32), mats.stone, 0, 0.15, 0);
  batcher.addAt(box(2.3, 1.5, 2.3), towerMat, 0, 1.05, 0, { ry: 0.2 });
  batcher.addAt(box(1.8, 1.3, 1.8), towerMat, 0, 2.45, 0, { ry: -0.15 });
  batcher.addAt(box(1.3, 1.1, 1.3), towerMat, 0, 3.65, 0, { ry: 0.3 });
  batcher.addAt(cyl(0.05, 0.05, 1.1, 6), mats.gold, 0, 4.75, 0);
  const ringGeo = new THREE.TorusGeometry(1.9, 0.09, 8, 40);
  batcher.add(ringGeo, CM.ring, M4(0, 3.1, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.35)));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), coreMaterial);
  orb.position.set(0, 5.35, 0); orb.castShadow = false;
  group.add(orb);

  // trees + lanterns + scatter
  coniferPieces(batcher, mats, -9, -6, 0.5, 1.2, true);
  coniferPieces(batcher, mats, 9.5, -5, 2.1, 1.05, true);
  coniferPieces(batcher, mats, -10, 6.5, 1.2, 0.95, true);
  coniferPieces(batcher, mats, 10, 7, 0.2, 1.25, true);
  const pools = [];
  for (const [lx, lz] of [[-5, 5], [5, 5]]) { lanternPieces(batcher, { ...mats, rust: mats.rust }, lx, lz, CM.lantern); pools.push({ x: lx, z: lz }); }
  const rand = rng(99);
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2, r = 8 + rand() * 5;
    batcher.addAt(new THREE.ConeGeometry(0.16, 0.4 + rand() * 0.2, 5), mats.pineDark,
      Math.cos(a) * r, 0.2, Math.sin(a) * r, { sz: 0.5 }, { cast: false });
  }

  // portal back to the centre plaza, at the end of the path
  const portalBase = M4(0, 0, -11.5, 0);
  const portal = buildPortalVisual({ batcher, mats, coreMaterial, baseMatrix: portalBase });
  group.add(portal.group);

  // name sign （サイバーセンター print)
  const signTex = canvasTex(512, 160, (x) => {
    x.fillStyle = '#22392c'; x.fillRect(0, 0, 512, 160);
    x.strokeStyle = '#8dffb0'; x.lineWidth = 5; x.strokeRect(10, 10, 492, 140);
    x.fillStyle = '#c9ffe0'; x.font = '700 52px "Hiragino Sans","Noto Sans JP",sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('サイバーセンター', 256, 82);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), paper({ map: signTex, emissive: '#0a2d1c' }));
  sign.position.set(3.4, 1.5, -10.6); sign.rotation.y = 0.5;
  group.add(sign);
  batcher.addAt(box(0.12, 1.6, 0.12), mats.trunk, 2.3, 0.8, -10.9);
  batcher.addAt(box(0.12, 1.6, 0.12), mats.trunk, 4.5, 0.8, -10.3);

  batcher.build(group);
  return { group, pools, pulsers: [orb], portalCore: portal.core };
}
