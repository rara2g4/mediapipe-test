# MediaPipe Face FX Studio

MediaPipe Tasks Vision を使い、Web カメラまたはアップロード画像に顔加工エフェクトを重ねる静的 Web アプリです。
ビルドツールなしの native ES modules 構成です。

## 起動

```powershell
npm.cmd run serve
```

起動後、Chrome などで以下を開きます。

```txt
http://127.0.0.1:8000/
```

## チェック

```powershell
npm.cmd run check
```

`app/src/**/*.js` と `tools/**/*.mjs` を自動検出して `node --check` を実行します。

## カメラだけ確認する

MediaPipe を使わず、ブラウザのカメラ権限だけ切り分けたい場合は別ポートで起動します。

```powershell
npm.cmd run serve:dev
```

```txt
http://127.0.0.1:8001/camera-test.html
```

## フォルダ構成

```txt
C:\mediapipe-test-main
  app/        実際に配信する Web アプリ
  dev/        手動検証用ページ
  docs/       設計メモ、構造メモ
  tools/      開発補助スクリプト
```

## 主要ファイル

- `app/index.html`: 画面構造。
- `app/styles.css`: UI、レスポンシブレイアウト、ギャラリーの見た目。
- `app/src/main.js`: アプリ起動、状態、各 controller の接続。
- `app/src/core/`: 設定、状態、共通数値処理、ページ離脱時 cleanup。
- `app/src/input/`: カメラ入力と画像アップロード。
- `app/src/mediapipe/`: MediaPipe detector と検出結果の整形。
- `app/src/effects/`: エフェクト定義、メタデータ、一覧 UI。
- `app/src/rendering/`: Canvas 描画と blendshape 表示。
- `app/src/gallery/`: 一時保存ギャラリー。
- `app/src/ui/`: DOM 参照取得と UI イベント配線。
- `dev/camera-test.html`: MediaPipe を使わないカメラ権限切り分けページ。

## 設計メモ

通常利用時はカメラ/画像プレビュー、エフェクト選択、撮影、保存、ギャラリーを中心にします。
ROI、blendshape、セグメンテーションなどの検証情報は Dev Mode 側に寄せています。
