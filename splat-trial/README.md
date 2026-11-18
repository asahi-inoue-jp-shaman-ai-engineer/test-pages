# 第0段試行: 実写スプラットの配信＋FPS表示 実証

目的: 実写キャプチャ品質の3Dスプラットが、スマホブラウザでストリーミング配信＋一人称（FPS）表示できることを実証する（D-Planetリアル化リサーチ report.md §4「第0段」）。

## 使用サンプル

- ファイル: `apartment.sog`（SOG v2、661,466 splats、8,379,050 bytes）
- 作品名: “SA3D_R&D_XP47”（実在のアパートメント室内を多数の写真から再構成した実写キャプチャ）
- 作者: Stephane Agullo（SA3D, https://sa3d.fr）
- 出典: PlayCanvas公式サンプル（playcanvas/engine リポジトリ examples/assets/splats/、元は SuperSplat 公開シーン https://superspl.at/view?id=cdcec084 ）
- ライセンス: **CC BY 4.0**（作者クレジット必須、商用利用可）。クレジットはページ内にも表示している。
- 選定理由: PlayCanvas公式サンプルでライセンス明記（同梱 apartment.txt）があり、部屋規模の実写キャプチャとして歩行FPSの検証に適したサイズ・点数だったため。Spark公式サンプルカタログにも同じファイルが「Apartment (v2 .sog)」として掲載され、推奨視点が公開されている。

## 向きの注意（検証で判明）

このSOGは OpenCV 系の座標フレームで格納されており、Spark/three.js では **X軸180°回転（rx=180）** を掛けないと正しく立たない。ページではデフォルトで rx=180 を適用している（`?rx=` で上書き可）。Spark公式サンプルカタログの推奨視点（position [-3.8, 0.4, 7.2] → target [0, 0.4, 0]）もこの反転後の座標系のもので、開始視点として採用した。

## 配信形式

- SOG（単一ファイル）のまま配信。Spark 2.4.0 がそのまま読み込む。
- Streamed SOG（PlayCanvas の lod-meta.json 形式）は PlayCanvas エンジン専用で Spark では読めないため不採用。Spark 側の LoD／描画予算は SparkRenderer の `maxSplats` で制御でき、ページは `?budget=N` パラメータで指定可能（モバイル予算の実験用）。

## ページ

- `index.html`: 既存の花見小路FPSページ（Spark 2.4.0 + three 0.180.0、lib/ はリポジトリ共通の `../lib/` を参照）の操作系（ドラッグ見回し／WASD／バーチャルスティック）を流用。
- 検証用パラメータ: `?diag=1`（中心点パーセンタイル）、`?cx=&cy=&cz=&yaw=&pitch=`（視点上書き）、`?budget=N`（描画予算）、`?file=`（別ファイル）。
