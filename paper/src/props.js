// props.js — 紙パーツ（木・ランタン等）のバッチ登録ヘルパー。
// パーツは「部品の組み合わせ」を batcher へ登録する関数として定義する。
// タイルと同じくレジストリ式に拡張できる形（将来の住人パーツの受け皿）。
import * as THREE from 'three';

function put(batcher, base, geo, mat, x, y, z, o = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)),
    new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
  batcher.add(geo, mat, new THREE.Matrix4().multiplyMatrices(base, m), o.opts || {});
}
const baseAt = (x, z, ry = 0, s = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, 0, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
  new THREE.Vector3(s, s, s));

const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);

export function coniferPieces(batcher, mats, x, z, ry, s = 1, dark = false) {
  const base = baseAt(x, z, ry, s);
  const c1 = dark ? mats.pineDark : mats.pine, c2 = dark ? mats.pine : mats.sage;
  put(batcher, base, cyl(0.09, 0.13, 0.55, 8), mats.trunk, 0, 0.27, 0);
  const tiers = [[1.08, 1.15, 0.95, c1], [0.82, 1.0, 1.62, c2], [0.54, 0.85, 2.24, c1]];
  for (const [r, h, y, m] of tiers) put(batcher, base, new THREE.ConeGeometry(r, h, 9), m, 0, y, 0, { sz: 0.5 });
}
export function roundTreePieces(batcher, mats, x, z, ry, s = 1) {
  const base = baseAt(x, z, ry, s);
  put(batcher, base, cyl(0.10, 0.15, 0.95, 8), mats.trunk, 0, 0.47, 0);
  const blobs = [[0.88, 0, 1.62, 0, mats.sage], [0.62, 0.5, 1.3, 0.12, mats.olive], [0.55, -0.46, 1.36, -0.1, mats.sage]];
  for (const [r, bx, y, bz, m] of blobs) {
    put(batcher, base, new THREE.SphereGeometry(r, 18, 12), m, bx, y, bz, { sy: 0.82, sz: 0.55 });
  }
}
/** Lantern: stone base + post + glowing box + cap. Returns nothing; caller places light pools. */
export function lanternPieces(batcher, mats, x, z, glowMat) {
  const base = baseAt(x, z, 0, 1);
  put(batcher, base, cyl(0.16, 0.2, 0.18, 10), mats.stone, 0, 0.09, 0);
  put(batcher, base, cyl(0.05, 0.065, 1.5, 8), mats.trunk, 0, 0.9, 0);
  put(batcher, base, new THREE.BoxGeometry(0.42, 0.48, 0.42), glowMat, 0, 1.82, 0);
  put(batcher, base, new THREE.ConeGeometry(0.4, 0.26, 4), mats.rust, 0, 2.18, 0, { ry: Math.PI / 4 });
}
