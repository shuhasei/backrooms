# Infinite Backrooms — Co-op Prototype

ブラウザで動く、手続き生成型 Backrooms ホラーのプロトタイプです。

提供された参考画像は**見た目・シルエットの資料としてのみ参照**し、第三者画像そのものはリポジトリへ再配布していません。壁紙・床・天井・怪物は Three.js と CanvasTexture / プリミティブ形状で手続き生成しています。

## 今回追加した内容

### 1. 視点追従
- デスクトップ: Pointer Lock + マウスルック
- タッチ端末: スワイプで視点変更
- 対応端末: DeviceOrientation を許可すると、端末を向けた方向へ視点が追従
- 走行時のFOV変化、ヘッドボブ、足音で移動感を強化

### 2. 軽量化
旧版の「多数の個別 Mesh + PointLight + Shadow」を減らし、次を採用しています。

- 壁・柱・巾木・蛍光灯を `THREE.InstancedMesh` 化
- リアルタイム影を無効化
- 通常は 3x3 チャンクだけ保持
- Auto画質ではFPSに応じて動的解像度を調整
- Low / Balanced / High / Auto の画質設定
- 怪物数を抑え、近距離だけAIと衝突判定を更新

### 3. マイク音声感知
`navigator.mediaDevices.getUserMedia()` と Web Audio API で**声の音量（RMS）だけ**をローカル計測します。

- 一定以上の音量を怪物が「聞く」
- 壁越しでも聴覚範囲内なら追跡状態へ移行
- 音声データの録音・保存・送信はしません
- `K` キーまたはメニューから ON/OFF

> マイク機能は HTTPS または localhost が必要です。GitHub Pages は HTTPS なので利用できます。

### 4. 最大4人オンライン協力
静的な GitHub Pages でも試せるように PeerJS の公開シグナリングを利用する P2P プロトタイプを実装しています。

- ホスト1人 + 参加3人 = 最大4人
- ホストが表示したルームコードをフレンドが入力
- プレイヤー位置・向き・レベル移動を同期
- 他プレイヤーを簡易3Dアバターで表示

> 公開 PeerJS サービスの利用可否・NAT/Firewall・ネットワーク環境によって接続できない場合があります。本番運用では専用シグナリング/STUN/TURNの用意を推奨します。

### 5. 全22ステージ
Level 0 から Poolrooms まで、色・床材・霧・壁密度・柱密度・怪物・パズルを変えた22ステージをデータ駆動で生成します。

- Level 0 / The Yellow Rooms
- Habitable Zone
- Pipe Dreams
- Electrical Station
- Abandoned Office
- Terror Hotel
- Lights Out
- Flooded Rooms
- Cave System
- Suburban Simulation
- Field of Wheat
- Endless City
- The Matrix
- Infinite Apartments
- Military Hospital
- Futuristic Halls
- Altered Reality
- Carrier Deck
- Memories
- Attic Maze
- Warehouse
- The Poolrooms

### 6. パズル
3系統をステージごとに切り替えます。

- ヒューズ・アイテム回収
- 複数端末の起動
- 番号順のシーケンス入力

全部完了すると出口ポータルが出現し、`E` で次のレベルへ進みます。

### 7. エンティティ
参考画像の雰囲気をもとに、画像貼り付けではなく低コストな3Dプリミティブで6系統を作っています。

- Balloon stalker
- Wire walker
- Faceless brute
- Eye crawler
- Maw / tendril entity
- Floor crawler

徘徊・視覚反応・マイク音への反応・追跡・接触演出・歩行アニメーションがあります。

### 8. 映像フィルター
メニューまたは `V` キーで切り替えできます。

- Clean
- VHS
- Bodycam
- Night

## 操作

| 操作 | 内容 |
|---|---|
| マウス | 視点 |
| WASD / 矢印 | 移動 |
| Shift | 走る |
| E | 調べる / 取得 / 次レベル |
| M | 蛍光灯環境音 |
| K | マイク感知 |
| V | 映像フィルター切替 |
| Esc | メニュー |

## ローカル実行

ES Modules とマイク権限の都合で、`file://` ではなく HTTP サーバーから開いてください。

```bash
python -m http.server 8000
```

その後 `http://localhost:8000` を開きます。

## GitHub Pages

1. Repository **Settings**
2. **Pages**
3. **Deploy from a branch**
4. `main` / `/ (root)` を選択

## 構成

- `index.html` — UI / HUD / 設定 / マルチプレイ操作
- `style.css` — Bodycam・VHSなどの画面効果
- `game.js` — Three.js ワールド、AI、パズル、マイク、P2P同期

## 注意

これはブラウザだけで成立する「遊べるプロトタイプ」です。商用ゲームレベルのオンライン同期、権威サーバー式AI、セーブ、専用マッチメイク、ボイスチャット等は別途バックエンドが必要です。
