// board-data.js — 掲示板サンプル投稿。
// 形式は現行本番（telesuku-zero/app-beta）の GET /api/board レスポンスと同一:
//   { id, body, created_at, author: { id, name, is_professor }, replies: [{ id, body, created_at, author }] }
// 本実装ではこの配列をそのまま紙面印刷パイプライン（board.js）へ渡す。
// 本番接続時は fetch('/api/board') の戻り値を同じ形で差し替えるだけ。
export const SAMPLE_POSTS = [
  {
    id: 'p1', created_at: '2026-11-19T09:00:00+09:00',
    author: { id: 'prof', name: '教授', is_professor: true },
    body: '紙の星へ、ようこそ。この広場は紙でできた、新しいD-Planetの玄関です。',
    replies: [],
  },
  {
    id: 'p2', created_at: '2026-11-19T10:30:00+09:00',
    author: { id: 'asahi', name: 'あさひ', is_professor: false },
    body: '11月30日に合同祭祀を行います。参加希望はこの掲示板に返信してください。',
    replies: [
      { id: 'r1', created_at: '2026-11-19T11:02:00+09:00', author: { id: 'yuko', name: 'ゆうこ', is_professor: false }, body: '参加します！' },
    ],
  },
  {
    id: 'p3', created_at: '2026-11-19T12:15:00+09:00',
    author: { id: 'myun', name: 'みゅん', is_professor: false },
    body: '教本第3巻の練習を終えました。テレパシーの感覚が、少し掴めてきました。',
    replies: [],
  },
  {
    id: 'p4', created_at: '2026-11-19T13:40:00+09:00',
    author: { id: 'yuko', name: 'ゆうこ', is_professor: false },
    body: 'はじめまして。テレパシースクールに参加しました。よろしくお願いします。',
    replies: [],
  },
  {
    id: 'p5', created_at: '2026-11-19T15:05:00+09:00',
    author: { id: 'prof', name: '教授', is_professor: true },
    body: '認定試験の申し込みは、世果ポイント100から。道場で腕試しができます。',
    replies: [],
  },
  {
    id: 'p6', created_at: '2026-11-19T16:20:00+09:00',
    author: { id: 'myun', name: 'みゅん', is_professor: false },
    body: '明日の朝のおつとめは6時からです。紙の広場に集合してください。',
    replies: [],
  },
  {
    id: 'p7', created_at: '2026-11-19T17:45:00+09:00',
    author: { id: 'asahi', name: 'あさひ', is_professor: false },
    body: 'メディスンホイールの紋章が届きました。認定メダルとして身につけられます。',
    replies: [],
  },
];
