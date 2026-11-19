# アバター JSON 設計図 — スキーマ草案（ステップ4）

D-Planet〜紙の星〜 の紙人形アバターを、JSON の「設計図」から組み立てる仕組みの形式定義。
狙いは将来のこの流れ:

> 住人が自分の Muse に言葉で頼む（「緑の服で、金の首飾りをつけた紙人形にして」）
> → Muse がこの形式で設計図（JSON）を書く
> → アプリが設計図を読んでアバターが組み上がる

これは MAP API と同じ発想の「アバター API」。運営が提供するのは**形式と部品の初期セットと
最低限のルールだけ**で、アバターの自由度は住人に渡す（プラットフォーム原則、計画 §7.5）。
運営が用意する完成品は「公式アイテム」と「初期アバター数種類（= 本書のサンプル）」のみ。

- 実装: `avatar.js`（レジストリ＋組み立て＋バリデーション）
- サンプル兼・初期アバター: `avatar-blueprints.json`
- 機械可読スキーマ: `avatar-blueprint.schema.json`

## 設計図の形

```json
{
  "version": 1,
  "name": "みゅん",
  "parts": {
    "body": "body.standard",
    "face": "face.standard",
    "hair": "hair.long",
    "top": "top.dress",
    "bottom": "bottom.pants"
  },
  "colors": {
    "skin": "#f6cf9f",
    "hair": "#8a5a34",
    "top": "#f3e9d2",
    "bottom": "#c9b18a",
    "accent": "#d9a441"
  },
  "equipment": {
    "neck": "equip.necklace.medal",
    "head": "equip.halo.gold",
    "hand": null
  },
  "label": { "accent": "#d9a441" },
  "scale": 1.0
}
```

## フィールド定義

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `version` | number | ○ | 形式の版。現在は `1` のみ |
| `name` | string | ○ | 表示名。吹き出し式の紙カード名札に印刷される（10 文字まで） |
| `parts.body` | string | ○ | 体（骨格・肌の土台）のパーツ ID |
| `parts.face` | string | ○ | 顔（Canvas 印刷の表情）のパーツ ID |
| `parts.hair` | string | ○ | 髪のパーツ ID |
| `parts.top` | string | ○ | 上半身の衣装パーツ ID |
| `parts.bottom` | string | ○ | 下半身の衣装パーツ ID |
| `colors.skin` | string `#rrggbb` | ○ | 肌の色スロット |
| `colors.hair` | string `#rrggbb` | ○ | 髪の色スロット |
| `colors.top` | string `#rrggbb` | ○ | 上半身の色スロット |
| `colors.bottom` | string `#rrggbb` | ○ | 下半身の色スロット |
| `colors.accent` | string `#rrggbb` | ○ | 差し色（名札の既定色など） |
| `equipment.neck` | string \| null | — | 首まわりの装備スロット（ID か null） |
| `equipment.head` | string \| null | — | 頭の装備スロット |
| `equipment.hand` | string \| null | — | 手持ちの装備スロット |
| `label.accent` | string `#rrggbb` | — | 名札の差し色。省略時は `colors.accent` |
| `scale` | number | — | 全体の大きさ 0.7–1.4（省略時 1） |

## パーツカタログ（初期セット）

パーツ ID は名前空間つき文字列。カタログはレジストリ（`registerAvatarPart`）で、
**後からパーツを足せる**のが前提。将来の住人パーツは別名前空間（例: `atelier.*`）で
追加される想定で、運営パーツと衝突しない。

| 部位 | ID | 内容 | 備考 |
|---|---|---|---|
| 体 | `body.standard` | 標準の紙人形骨格（脚・腕・頭のピボット＋靴） | |
| 顔 | `face.standard` | 通常の表情（開いた目＋笑口） | |
| 顔 | `face.calm` | 穏やかな表情（閉じ目） | |
| 顔 | `face.smile` | 大きな笑口 | |
| 髪 | `hair.short` | 短髪（キャップのみ） | |
| 髪 | `hair.long` | 長髪（キャップ＋後ろ髪） | |
| 髪 | `hair.bob` | ボブ（キャップ＋短い後ろ髪） | |
| 髪 | `hair.none` | 髪なし | |
| 上 | `top.plain` | 無地（胴体の色スロットそのまま） | |
| 上 | `top.dress` | ドレス（色スロット色のスカートフレア付き） | |
| 下 | `bottom.pants` | ズボン（脚全体） | |
| 下 | `bottom.skirt` | スカート＋短い脚 | |
| 装備・首 | `equip.necklace.medal` | 金の首飾り＋紋章メダル | **公式アイテム** |
| 装備・頭 | `equip.halo.gold` | 金の輪 | **公式アイテム** |
| 装備・手 | `equip.lantern.paper` | 手持ち紙ランタン | |

## ルール（最低限）

「壊れない・他の人の画面が破綻しない」範囲だけを検証し、それ以外は自由:

1. 色は `#rrggbb` 形式のみ。形式が違う色は既定色に置き換える。
2. 未知のパーツ ID は、その部位の既定パーツにフォールバックする（設計図全体を落とさない）。
3. `scale` は 0.7–1.4 に丸める。`name` は 10 文字で切る（名札の印刷範囲）。
4. 装備スロットに未知 ID が来たら、そのスロットだけ空にする。

検証は `validateBlueprint()` が行い、警告はコンソールに出す（将来は設計図の
書き手＝Muse へのフィードバックに使う）。

## サンプル

`avatar-blueprints.json` に初期アバター 3 体（みゅん／あさひ／ゆうこ）が
この形式で入っている。これがそのまま「初期アバター（運営提供）」であり、
住人が自分の設計図を書くときの手本を兼ねる。
