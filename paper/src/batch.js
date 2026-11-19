// batch.js — 静的紙パーツの描画バッチ化基盤（ステップ4）。
// Papertrails 本家（foundation/src/world/world.js）と同じ方針: マテリアル毎に THREE.BatchedMesh へ
// 集約し、ドローコールを「マテリアル数＋影パス分」に抑える。基盤コードは無改変 import が原則のため、
// バッチャ自体は D-Planet 側の新規実装（汎用の仕組みとして切り出した）。
//
// 使い方:
//   const b = createBatcher();
//   b.add(geo, mat, matrix, { cast, receive, tint });
//   b.addAt(geo, mat, x, y, z, { ry, sx... }, opts);
//   b.build(parentGroup);
//
// ジオメトリは BatchedMesh の要件（属性レイアウト統一・インデックス付き）に合わせて正規化する:
// position(3) / normal(3) / uv(2) / color(3)。color は紙マテリアルの頂点カラー（色の掛け算）に使う。
import * as THREE from 'three';

function normaliseGeometry(src, tint) {
  const g = new THREE.BufferGeometry();
  let work = src;
  if (!src.getAttribute('normal')) { work = src.clone(); work.computeVertexNormals(); }
  const pos = work.getAttribute('position');
  const count = pos.count;
  const spec = { position: 3, normal: 3, uv: 2, color: 3 };
  for (const name in spec) {
    const size = spec[name];
    const a = work.getAttribute(name);
    const arr = new Float32Array(count * size);
    if (a) {
      const n = Math.min(size, a.itemSize);
      for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) arr[i * size + k] = a.getComponent(i, k);
      if (name === 'color' && n < 3) for (let i = 0; i < count; i++) for (let k = n; k < 3; k++) arr[i * size + k] = 1;
    } else if (name === 'color') {
      const c = tint || { r: 1, g: 1, b: 1 };
      for (let i = 0; i < count; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    }
    g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  // explicit tint overrides any baked vertex colour (tile tone variation etc.)
  if (tint && src.getAttribute('color')) {
    const arr = g.getAttribute('color').array;
    for (let i = 0; i < count; i++) { arr[i * 3] = tint.r; arr[i * 3 + 1] = tint.g; arr[i * 3 + 2] = tint.b; }
  }
  const idx = work.getIndex();
  const ia = new Uint32Array(idx ? idx.count : count);
  if (idx) for (let i = 0; i < ia.length; i++) ia[i] = idx.getX(i);
  else for (let i = 0; i < ia.length; i++) ia[i] = i;
  g.setIndex(new THREE.BufferAttribute(ia, 1));
  return g;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function composeMatrix(x = 0, y = 0, z = 0, o = {}) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export function createBatcher() {
  const buckets = new Map(); // key -> { material, cast, receive, items: [{geo, matrix}] }
  const api = {
    add(geo, material, matrix, opts = {}) {
      const cast = opts.cast !== false;
      const receive = opts.receive !== false;
      const key = material.uuid + '|' + (cast ? 1 : 0) + (receive ? 1 : 0);
      let b = buckets.get(key);
      if (!b) { b = { material, cast, receive, items: [] }; buckets.set(key, b); }
      const tint = opts.tint ? new THREE.Color(opts.tint) : null;
      b.items.push({ geo: normaliseGeometry(geo, tint), matrix });
      return api;
    },
    addAt(geo, material, x, y, z, o = {}, opts = {}) {
      return api.add(geo, material, composeMatrix(x, y, z, o), opts);
    },
    build(parent) {
      const meshes = [];
      for (const b of buckets.values()) {
        let verts = 0, indices = 0;
        for (const it of b.items) { verts += it.geo.getAttribute('position').count; indices += it.geo.getIndex().count; }
        const mesh = new THREE.BatchedMesh(b.items.length, verts, indices, b.material);
        for (const it of b.items) {
          const gid = mesh.addGeometry(it.geo);
          const id = mesh.addInstance(gid); // three r187: instances are explicit
          mesh.setMatrixAt(id, it.matrix);
        }
        // (three r187: BatchedMesh keeps matrices in a DataTexture — setMatrixAt already flags it)
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.receive;
        mesh.frustumCulled = false; // bounds span the whole space; culling is handled by space visibility
        mesh.computeBoundingSphere();
        parent.add(mesh);
        meshes.push(mesh);
      }
      buckets.clear();
      return meshes;
    },
  };
  return api;
}

// paint helper for DYNAMIC merged parts (avatars): fill a geometry's color attribute with one
// flat colour (linear space via THREE.Color), so several painted geometries can merge into a
// single mesh under one white paper material.
export function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}
