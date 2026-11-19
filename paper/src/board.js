// board.js — 掲示板の本実装（ステップ4）。
// foundation の book.js と同じ「紙面への印刷」パイプライン: Canvas に投稿を描いて
// テクスチャ化し、紙の板に貼る。投稿データは現行本番の掲示板形式（board-data.js）。
// ページ切替は「めくり」アニメーション付き（面を縦軸でひねり、中点で印刷を差し替える）。
import * as THREE from 'three';

export const POSTS_PER_PAGE = 3;
const W = 1024, H = 640;

function wrapText(x, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (x.measureText(line + ch).width > maxWidth && line) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawPage(x, posts, page, pageCount, title = 'テレスク掲示板', subtitle = 'D-Planet〜紙の星〜') {
  x.fillStyle = '#f7ecd2'; x.fillRect(0, 0, W, H);
  // header
  x.fillStyle = '#b25a3b'; x.beginPath(); x.roundRect(24, 20, 420, 62, 10); x.fill();
  x.fillStyle = '#fff6e6'; x.font = '700 36px "Hiragino Sans","Noto Sans JP",sans-serif';
  x.textBaseline = 'middle';
  x.fillText(title, 44, 52);
  x.fillStyle = '#8a6a4a'; x.font = '400 24px "Hiragino Sans","Noto Sans JP",sans-serif';
  x.fillText(subtitle, 470, 52);
  x.fillStyle = '#5a3a28'; x.font = '700 30px "Hiragino Sans","Noto Sans JP",sans-serif';
  x.textAlign = 'right'; x.fillText(`${page + 1} / ${pageCount}`, W - 36, 52); x.textAlign = 'left';
  // posts as pinned paper notes
  const noteCols = ['#fdf6e3', '#eec0ae', '#ecca7f', '#b9c48d', '#a8cfc9'];
  posts.forEach((p, i) => {
    const ny = 104 + i * 172, nx = 24, nw = W - 48, nh = 156;
    x.fillStyle = noteCols[(page * POSTS_PER_PAGE + i) % noteCols.length];
    x.beginPath(); x.roundRect(nx, ny, nw, nh, 8); x.fill();
    x.fillStyle = '#c0392b'; x.beginPath(); x.arc(nx + nw / 2, ny + 12, 7, 0, 7); x.fill();
    // author line
    x.fillStyle = '#43302a'; x.font = '700 30px "Hiragino Sans","Noto Sans JP",sans-serif';
    const name = (p.author && p.author.name) || 'ななし';
    x.fillText(name, nx + 22, ny + 40);
    let cursor = nx + 22 + x.measureText(name).width + 14;
    if (p.author && p.author.is_professor) {
      x.fillStyle = '#d9a441'; x.beginPath(); x.roundRect(cursor, ny + 22, 74, 36, 8); x.fill();
      x.fillStyle = '#fff6e6'; x.font = '700 24px "Hiragino Sans","Noto Sans JP",sans-serif';
      x.fillText('教授', cursor + 13, ny + 41);
      cursor += 88;
    }
    const d = new Date(p.created_at);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    x.fillStyle = '#8a6a4a'; x.font = '400 24px "Hiragino Sans","Noto Sans JP",sans-serif';
    x.fillText(dateStr, cursor + 6, ny + 41);
    if (p.replies && p.replies.length) {
      x.textAlign = 'right'; x.fillStyle = '#b25a3b'; x.font = '700 24px "Hiragino Sans","Noto Sans JP",sans-serif';
      x.fillText(`返信 ${p.replies.length} 件`, nx + nw - 20, ny + 41); x.textAlign = 'left';
    }
    // body
    x.fillStyle = '#43302a'; x.font = '400 31px "Hiragino Sans","Noto Sans JP",sans-serif';
    const lines = wrapText(x, p.body || '', nw - 44);
    lines.forEach((ln, li) => x.fillText(ln, nx + 22, ny + 82 + li * 40));
  });
  if (!posts.length) {
    x.fillStyle = '#8a6a4a'; x.font = '400 30px "Hiragino Sans","Noto Sans JP",sans-serif';
    x.fillText('まだ投稿がありません', 44, 160);
  }
}

/**
 * Build the bulletin board. Frame pieces go into the batcher; the printed face is a
 * separate mesh on a flip pivot. Returns { group, setPage, nextPage, prevPage, page, pageCount, update }.
 */
export function createBoard({ batcher, mats, paper, posts, title, subtitle }) {
  const group = new THREE.Group();
  const pageCount = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  let page = 0, flip = 0, flipFrom = 0, flipTo = 0; // flip: 0 idle, else progress 0..1

  // frame (batched): posts, backing board, roof — placed by the caller via group transform,
  // so frame pieces are registered in world space by the caller instead. Here we only add
  // the dynamic face; the caller batches the frame at the same transform.
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx2d = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const print = () => {
    drawPage(ctx2d, posts.slice(page * POSTS_PER_PAGE, page * POSTS_PER_PAGE + POSTS_PER_PAGE), page, pageCount, title, subtitle);
    tex.needsUpdate = true;
  };
  print();

  const pivot = new THREE.Group(); pivot.position.set(0, 1.72, 0.06); group.add(pivot);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), paper({ map: tex }));
  face.castShadow = false; face.receiveShadow = false;
  pivot.add(face);
  // paper back of the sheet (visible mid-flip)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), paper({ color: '#efe0c2' }));
  back.rotation.y = Math.PI; back.position.z = -0.005;
  pivot.add(back);

  function goTo(n) {
    const target = ((n % pageCount) + pageCount) % pageCount;
    if (target === page || flip > 0) return;
    flipFrom = page; flipTo = target; flip = 0.0001;
  }
  return {
    group,
    get page() { return page; },
    get pageCount() { return pageCount; },
    setPage: goTo,
    snapTo(n) { // instant jump without the flip (initial page from URL etc.)
      page = ((n % pageCount) + pageCount) % pageCount;
      flip = 0; pivot.rotation.y = 0; print();
    },
    nextPage() { goTo(page + 1); },
    prevPage() { goTo(page - 1); },
    update(dt) {
      if (!flip) { pivot.rotation.y = 0; return; }
      flip = Math.min(1, flip + dt / 0.45);
      const half = flip < 0.5;
      pivot.rotation.y = -Math.sin(flip * Math.PI) * 0.85;
      if (!half && page !== flipTo) { page = flipTo; print(); }
      if (flip >= 1) { flip = 0; pivot.rotation.y = 0; }
    },
  };
}

/** Frame pieces for the board, in board-local coords, registered into a batcher with a world matrix base. */
export function boardFramePieces(batcher, mats, baseMatrix) {
  const local = new THREE.Matrix4();
  const put = (geo, mat, x, y, z, o = {}) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)),
      new THREE.Vector3(1, 1, 1));
    local.multiplyMatrices(baseMatrix, m);
    batcher.add(geo, mat, local.clone());
  };
  // legs sit BEHIND the printed face plane (face is at z 0.06; a 0.15-deep leg at z 0
  // would poke 0.015 in front of the print and hide its edges)
  put(new THREE.BoxGeometry(0.15, 2.0, 0.15), mats.trunk, -1.55, 1.0, -0.08);
  put(new THREE.BoxGeometry(0.15, 2.0, 0.15), mats.trunk, 1.55, 1.0, -0.08);
  put(new THREE.BoxGeometry(3.7, 2.35, 0.1), mats.terra, 0, 1.72, 0);
  put(new THREE.BoxGeometry(4.0, 0.12, 0.45), mats.rust, 0, 3.0, 0.02, { rx: 0.18 });
}
