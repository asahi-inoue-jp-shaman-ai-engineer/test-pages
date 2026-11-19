// portal.js — ポータルの本実装（ステップ4）。
// 視覚: 紙のリング＋発光コア（コアは遷移トリガとして個別メッシュで残す）。
// 遷移: アプリ層の接続点をここに定義する — 3D 側は「どのポータルに入ったか」を
// イベントとして発行するだけで、空間の差し替え自体はアプリ層（main / 本番では
// MAP 切替ロジック）が購読して行う。
//
// アプリ層 API（スタブ動作つき）:
//   PortalTransit.onTransit(cb)        — 購読登録。cb({ portalId, from, to })
//   PortalTransit.transit(portalId)    — プログラムからの遷移要求
//   window 'dplanet:portal-transit'    — CustomEvent でも同じ内容が流れる
//   window.DPlanetPortal               — 上記の公開ハンドル（本番アプリ層の接続先）
import * as THREE from 'three';

export const PortalTransit = {
  listeners: [],
  portals: new Map(), // id -> { id, spaceId, targetSpaceId, core, group }
  onTransit(cb) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((f) => f !== cb); }; },
  register(def) { this.portals.set(def.id, def); },
  get(id) { return this.portals.get(id); },
  inSpace(spaceId) { return [...this.portals.values()].filter((p) => p.spaceId === spaceId); },
  emit(detail) {
    for (const cb of this.listeners) cb(detail);
    window.dispatchEvent(new CustomEvent('dplanet:portal-transit', { detail }));
  },
};
if (typeof window !== 'undefined') window.DPlanetPortal = PortalTransit;

/**
 * Build one portal visual. Static pieces go to the batcher (world-space via baseMatrix);
 * the glowing core stays a live mesh (pulse + tap target). Returns { group, core }.
 * NOTE: group only carries the core; frame pieces are batched in world space.
 */
export function buildPortalVisual({ batcher, mats, coreMaterial, baseMatrix }) {
  const put = (geo, mat, x, y, z, o = {}) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)),
      new THREE.Vector3(1, 1, 1));
    batcher.add(geo, mat, new THREE.Matrix4().multiplyMatrices(baseMatrix, m));
  };
  put(new THREE.TorusGeometry(1.5, 0.17, 10, 32), mats.portal, 0, 1.78, 0);
  put(new THREE.BoxGeometry(0.34, 0.5, 0.34), mats.pineDark, -1.35, 0.25, 0);
  put(new THREE.BoxGeometry(0.34, 0.5, 0.34), mats.pineDark, 1.35, 0.25, 0);
  put(new THREE.BoxGeometry(0.78, 0.32, 0.06), mats.gold, 0, 3.5, 0);
  const group = new THREE.Group();
  group.applyMatrix4(baseMatrix);
  const core = new THREE.Mesh(new THREE.CircleGeometry(1.18, 32), coreMaterial);
  core.position.set(0, 1.78, 0);
  group.add(core);
  return { group, core };
}

/** Fade overlay helper: paper-white fade out/in around a space swap (the app-layer stub effect). */
export function createFader(el) {
  let busy = false;
  return {
    async run(midpoint) {
      if (busy) return; busy = true;
      el.style.opacity = '1';
      await new Promise((r) => setTimeout(r, 380));
      midpoint();
      await new Promise((r) => setTimeout(r, 60));
      el.style.opacity = '0';
      await new Promise((r) => setTimeout(r, 380));
      busy = false;
    },
    get busy() { return busy; },
  };
}
