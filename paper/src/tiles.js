// tiles.js — 広場タイルセット（ステップ4）: 紙タイルの量産基盤。
//
// プラットフォーム原則（計画 §7.5）に従い、タイルは「運営の完成品」ではなく
// 住人が拡張できるフレームとして設計する:
//   - タイル部品はレジストリ登録式（registerTilePart）。ID は名前空間つき文字列。
//   - 配置はデータ（文字グリッドの MAP データ）で与える。将来はこのグリッドを
//     住人や各自の Muse が書いて MAP を作る想定（MAP API 的な形式）。
//   - 未知のタイル ID・文字は落とさず草タイルにフォールバックする（壊れない範囲の最小ルール）。
//
// タイル部品の契約: builder(ctx) -> pieces[]
//   ctx = { batcher, mats: { sheet, path }, cx, cz, tint }  （cx/cz はタイル中心のワールド座標）
//   piece は batcher.addAt(...) で直接登録してよい（builder の戻り値は使わない）。
import * as THREE from 'three';

export const TILE_SIZE = 6;

export const TILE_PARTS = new Map();
export function registerTilePart(id, builder) { TILE_PARTS.set(id, builder); }

const sheetGeo = new THREE.BoxGeometry(TILE_SIZE, 0.06, TILE_SIZE);
const stripZGeo = new THREE.BoxGeometry(2.3, 0.025, TILE_SIZE);
const stripXGeo = new THREE.BoxGeometry(TILE_SIZE, 0.025, 2.3);

function sheet(ctx) {
  ctx.batcher.addAt(sheetGeo, ctx.mats.sheet, ctx.cx, -0.03, ctx.cz, {}, { cast: false, tint: ctx.tint });
}
function stripZ(ctx) { ctx.batcher.addAt(stripZGeo, ctx.mats.path, ctx.cx, 0.004, ctx.cz, {}, { cast: false }); }
function stripX(ctx) { ctx.batcher.addAt(stripXGeo, ctx.mats.path, ctx.cx, 0.004, ctx.cz, {}, { cast: false }); }

registerTilePart('tile.grass', (ctx) => { sheet(ctx); });
registerTilePart('tile.path.z', (ctx) => { sheet(ctx); stripZ(ctx); });
registerTilePart('tile.path.x', (ctx) => { sheet(ctx); stripX(ctx); });
registerTilePart('tile.path.cross', (ctx) => { sheet(ctx); stripZ(ctx); stripX(ctx); });

// 文字グリッドの凡例（MAP データの語彙）。ここに文字を足すと新しいタイルが使える。
export const TILE_LEGEND = {
  g: 'tile.grass',
  '|': 'tile.path.z',
  '-': 'tile.path.x',
  '+': 'tile.path.cross',
};

// センター広場の MAP データ（7×7 タイル = 42×42、ページスラブ 48 の内側）。
// 中央の十字が小道。将来の部室 MAP も同じ形式で書ける。
export const CENTER_LAYOUT = [
  'ggggggg',
  'ggg|ggg',
  'ggg|ggg',
  '---+---',
  'ggg|ggg',
  'ggg|ggg',
  'ggggggg',
];

// サイバーセンターの MAP データ（5×5 = 30×30）。
export const CYBER_LAYOUT = [
  'ggggg',
  'gg|gg',
  '--+--',
  'gg|gg',
  'ggggg',
];

// deterministic hash tint so every grass tile differs very slightly (paper sheets vary)
function hashTint(gx, gz) {
  let h = (gx * 73856093) ^ (gz * 19349663);
  h = (h ^ (h >> 13)) >>> 0;
  const v = 0.94 + (h % 100) / 100 * 0.06; // 0.94..1.00
  return new THREE.Color(v, v * 0.995, v * 0.985);
}

/** Lay out a character-grid map into a batcher. Returns the map's world extent. */
export function buildTileMap(batcher, layout, mats, legend = TILE_LEGEND) {
  const rows = layout.length, cols = layout[0].length;
  const x0 = -((cols - 1) * TILE_SIZE) / 2, z0 = -((rows - 1) * TILE_SIZE) / 2;
  layout.forEach((row, gz) => {
    [...row].forEach((ch, gx) => {
      const id = legend[ch] || 'tile.grass';
      const builder = TILE_PARTS.get(id) || TILE_PARTS.get('tile.grass');
      builder({
        batcher, mats,
        cx: x0 + gx * TILE_SIZE, cz: z0 + gz * TILE_SIZE,
        tint: hashTint(gx - 3, gz - 3),
      });
    });
  });
  return { width: cols * TILE_SIZE, depth: rows * TILE_SIZE };
}
