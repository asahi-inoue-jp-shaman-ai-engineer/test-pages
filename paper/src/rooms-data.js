// rooms-data.js — 部室の「部屋定義データ」（ステップ6）。
//
// プラットフォーム原則（計画 §7.5）の証明用データ:
//   部室はコードではなく、この定義データだけで決まる。住人や各自の Muse が
//   この形式で定義を書けば、ビルダー（room.js）がそのまま部屋を組み立てる。
//   形式の説明は ROOMS.md を参照。
//
// 定義1件のフィールド:
//   id        空間 ID（PortalTransit の spaceId になる）
//   name      部屋の表示名
//   layout    文字グリッドの MAP データ（tiles.js の語彙: g 草 / | 縦道 / - 横道 / + 十字）
//   palette   { sheet, path, slab, wall, wallCap, disc } の紙色（hex）
//   sign      { title, sub, x, z, ry, bg, fg, border } 部の看板（紙面印刷）。null で看板なし
//   board     { title, sub, x, z, ry, posts } 部室掲示板（投稿は本番掲示板と同形式）。null で掲示板なし
//   gathering { x, z, seats } 集まれる円形広場（円盤＋腰掛け＋中央ランタン）。null でなし
//   trees     [{ kind: 'conifer'|'round', x, z, s, ry }]
//   lanterns  [{ x, z }] 紙ランタン（夜は光だまりが付く）
//   scatter   散布物（石・草）の個数の目安
//   wallGaps  [{ side: 'N'|'S'|'E'|'W', index }] 囲いの壁に門を開けるタイル位置
//   portals   [{ id, target, x, z, ry }] 他空間へのポータル（target は空間 ID）
//   spawns    [{ x, z, ry }] 部員アバターの初期配置（人数分）
//   seed      散布物の決定的乱数シード

const KAMBO_POSTS = [
  {
    id: 'k1', created_at: '2026-11-19T09:10:00+09:00',
    author: { id: 'prof', name: '教授', is_professor: true },
    body: 'カンボセンター開設のお知らせ。ここはカンボ部の部室です。近況の共有やセレモニーの相談はこちらへ。',
    replies: [],
  },
  {
    id: 'k2', created_at: '2026-11-19T11:25:00+09:00',
    author: { id: 'asahi', name: 'あさひ', is_professor: false },
    body: '今月のカンボは満月のセレモニーに合わせて行います。参加希望は返信で教えてください。',
    replies: [
      { id: 'k2r1', created_at: '2026-11-19T12:03:00+09:00', author: { id: 'yuko', name: 'ゆうこ', is_professor: false }, body: '参加します！' },
    ],
  },
  {
    id: 'k3', created_at: '2026-11-19T13:48:00+09:00',
    author: { id: 'myun', name: 'みゅん', is_professor: false },
    body: '解毒の記録をまとめました。体の変化を日々観察するのが楽しいです。',
    replies: [],
  },
  {
    id: 'k4', created_at: '2026-11-19T15:30:00+09:00',
    author: { id: 'yuko', name: 'ゆうこ', is_professor: false },
    body: 'はじめまして。カンボ部に入りました。よろしくお願いします。',
    replies: [],
  },
  {
    id: 'k5', created_at: '2026-11-19T17:12:00+09:00',
    author: { id: 'asahi', name: 'あさひ', is_professor: false },
    body: '部室の看板を紙で作り直しました。紙の星の部室、第一号です。',
    replies: [],
  },
];

export const ROOM_DEFS = [
  {
    id: 'kambo',
    name: 'カンボセンター',
    layout: [
      'ggggg',
      'gg|gg',
      'gg|gg',
      'gg|gg',
      'ggggg',
    ],
    palette: {
      sheet: '#7d9a5b', path: '#e8d3ac', slab: '#caa96f',
      wall: '#f7ecd2', wallCap: '#b25a3b', disc: '#f2e3c4',
    },
    sign: {
      title: 'カンボセンター', sub: '公式部活空間',
      x: -4.1, z: 10.3, ry: 0.35,
      bg: '#fdf6e3', fg: '#43302a', border: '#b25a3b',
    },
    board: {
      title: 'カンボ掲示板', sub: '部員限定',
      x: 7.2, z: -6.5, ry: -0.83,
      posts: KAMBO_POSTS,
    },
    gathering: { x: 0, z: 0, seats: 6 },
    trees: [
      { kind: 'conifer', x: -11.5, z: -11.0, s: 1.1, ry: 0.4 },
      { kind: 'round', x: 11.8, z: 11.6, s: 1.0, ry: 1.1 },
      { kind: 'conifer', x: -11.8, z: 3.0, s: 0.9, ry: 2.0 },
      { kind: 'round', x: 5.5, z: -11.8, s: 0.85, ry: 0.2 },
      { kind: 'conifer', x: 12.2, z: -1.5, s: 0.95, ry: 1.4 },
    ],
    lanterns: [
      { x: -2.3, z: 6.0 }, { x: 2.3, z: 6.0 },
      { x: -2.3, z: -6.0 }, { x: 2.3, z: -6.0 },
    ],
    scatter: 14,
    wallGaps: [{ side: 'S', index: 2 }, { side: 'N', index: 2 }],
    portals: [
      { id: 'portal-kambo-center', target: 'center', x: 0, z: 12.4, ry: Math.PI },
      { id: 'portal-kambo-hape', target: 'hape', x: 0, z: -12.4, ry: 0 },
    ],
    spawns: [
      { x: 1.95, z: 1.43, ry: -2.20 },
      { x: -2.03, z: 1.20, ry: 2.11 },
      { x: 0.15, z: -2.48, ry: -0.06 },
    ],
    seed: 2026,
  },
  {
    // 2室目のスケルトン: コードは1行も足さず、この定義データだけで生成される。
    // 掲示板なし・集会広場なし・木とランタン最小限 — 「データ差し替えだけで別室になる」ことの証拠。
    id: 'hape',
    name: 'ハペ部',
    layout: [
      'ggggg',
      'gg|gg',
      'gg|gg',
      'ggggg',
    ],
    palette: {
      sheet: '#d9b878', path: '#c9a45e', slab: '#a8834f',
      wall: '#efe0c2', wallCap: '#8a5a34', disc: '#e8d3ac',
    },
    sign: {
      title: 'ハペ部', sub: '部室（試作）',
      x: 4.3, z: 7.6, ry: -0.3,
      bg: '#f7ecd2', fg: '#43302a', border: '#8a5a34',
    },
    board: null,
    gathering: null,
    trees: [
      { kind: 'conifer', x: -10.5, z: -7.5, s: 1.0, ry: 0.7 },
      { kind: 'conifer', x: 10.8, z: -6.0, s: 0.9, ry: 1.9 },
    ],
    lanterns: [
      { x: -2.3, z: 0.0 }, { x: 2.3, z: 0.0 },
    ],
    scatter: 8,
    wallGaps: [{ side: 'N', index: 2 }],
    portals: [
      { id: 'portal-hape-kambo', target: 'kambo', x: 0, z: -8.9, ry: 0 },
    ],
    spawns: [
      { x: 2.2, z: 1.8, ry: -2.28 },
      { x: -2.2, z: 1.8, ry: 2.28 },
      { x: 0.0, z: -2.8, ry: 0.0 },
    ],
    seed: 777,
  },
];
