# App Structure

このメモは、現在のフォルダ構造と責務を素早く把握するためのものです。

## Top Level

```txt
C:\mediapipe-test-main
  app/
  dev/
  docs/
  tools/
```

- `app/`: ブラウザに配信する静的 Web アプリ本体。
- `dev/`: 切り分け用の手動検証ページ。通常アプリからは参照しない。
- `docs/`: 設計メモや作業メモ。
- `tools/`: チェックやメンテナンス用の Node スクリプト。

`tmp/` と `.chrome-camera-profile/` は検証時の生成物なので、アプリ構造には含めません。

## App

```txt
app
  index.html
  styles.css
  src
    main.js
    core
    input
    mediapipe
    effects
    rendering
    gallery
    ui
```

- `src/main.js`: アプリの合流点。状態、MediaPipe、入力、描画、ギャラリー、UI イベントを接続する。
- `src/core/`: 複数領域から使う基盤。設定、状態、math、cleanup。
- `src/input/`: カメラと画像アップロードの入力境界。
- `src/mediapipe/`: detector 初期化、遅延読み込み、検出結果の snapshot 化。
- `src/effects/`: エフェクト本体、メタデータ、UI 一覧生成。
- `src/rendering/`: Canvas ステージ描画と Dev Mode 表示。
- `src/gallery/`: 撮影結果の一時保存、一覧、プレビュー、ダウンロード。
- `src/ui/`: DOM 参照取得と UI イベント配線。

## Naming Rules

- 入口は `main.js`。
- 汎用的なものは `core/`。
- MediaPipe の生データをアプリが扱いやすい形に変換する処理は `detectionSnapshot.js`。
- エフェクト一覧とエフェクト本体は分ける。
  - `effectMetadata.js`: 表示名、説明、カテゴリ、必要機能。
  - `effectCatalogView.js`: メタデータから UI を生成。
  - `effectRegistry.js`: 実際に Canvas へ描画するエフェクト実装。
