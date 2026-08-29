# Infinite Backrooms — Co-op Prototype

ブラウザで動く、手続き生成型 Backrooms ホラーのプロトタイプです。

提供された参考画像は**見た目・シルエットの資料として参照**し、怪物は Three.js の軽量な3D形状として作り直しています。壁紙・床・天井も CanvasTexture / プリミティブ形状で手続き生成しています。

## 今回追加した内容

### 1. 視点追従
- デスクトップ: Pointer Lock + マウスルック
- タッチ端末: スワイプで視点変更
- 対応端末: DeviceOrientation を許可すると、端末を向けた方向へ視点が追従
- 走行時のFOV変化、ヘッドボブ、足音で移動感を強化

### 2. 軽量化
- 壁・柱・巾木・蛍光灯を `THREE.InstancedMesh` 化
- リアルタイム影を無効化
- 通常は周囲の小さなチャンク範囲だけ保持
- Auto画質ではFPSに応じて動的解像度を調整
- Low / Balanced / High / Auto の画質設定
- 怪物数を抑え、近距離中心にAIを更新

### 3. マイク音声感知
`navigator.mediaDevices.getUserMedia()` と Web Audio API で**声の音量（RMS）だけ**をローカル計測します。

- 声・叫び声が大きいほど `sound heat` が上昇
- 壁があっても聴覚範囲内なら敵が音の発生地点を調べに来る
- 走る足音も歩行より大きな音として扱う
- 音声データそのものは録音・保存しない
- `K` キーまたはメニューから ON/OFF

> マイク機能は HTTPS または localhost が必要です。GitHub Pages は HTTPS なので利用できます。

### 4. 最大4人オンライン協力
PeerJS の公開シグナリングを使ったP2Pプロトタイプです。

- ホスト1人 + 参加3人 = 最大4人
- プレイヤー位置・向き・レベル移動を同期
- 他プレイヤーのマイク音量情報も、そのプレイヤー位置から発生した「音」としてAIへ反映
- 他プレイヤーを簡易3Dアバターで表示

> 公開 PeerJS サービスの利用可否・NAT/Firewall・ネットワーク環境によって接続できない場合があります。本番運用では専用シグナリング/STUN/TURNの用意を推奨します。

### 5. 全23ステージ
Level 0 から Poolrooms、さらに遭遇率100%の `Level !` まで23ステージを用意しています。

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
- Level ! / RUN FOR YOUR LIFE（強制追跡）

### 6. パズル
- ヒューズ・アイテム回収
- 複数端末の起動
- 番号順のシーケンス入力

全部完了すると出口ポータルが出現し、`E` で次のレベルへ進みます。

### 7. エンティティを参考画像に寄せて再構築
以前の単純な棒人間状モデルをやめ、参考画像で目立つ輪郭・体格・パーツを個別に再現しました。

- **Balloon entity** — 痩せた黄褐色の筋肉質な人型、肋骨状の胸、上げた右腕、細い紐、縦長の赤い風船
- **Wire entity** — 黒い線が絡んだ頭部、極端に細く長い腕脚、肩周りの輪状ワイヤー
- **Split-face entity** — 灰色の大型人型、広い肩、縦方向に裂けた暗赤色の口と歯
- **Floor-head entity** — 黒い床穴から出た錆色の頭部・胸部、床を這う長い枝状の腕と指
- **Winged/tendril entity** — 人間の下半身と青い衣服、巨大な黄褐色の有機体、赤黒い口、黒い触手
- **Eye entity** — 大きな単眼、細長い左右の腕、指のある手

### 8. 「遭遇確率」ではなくアクティブ危険圧
敵は毎フレームの単純な乱数抽選では出現しません。プレイヤーの状態から `THREAT / DANGER` をリアルタイム計算し、危険圧が各階層の閾値を超えた場合にのみ出現します。

危険圧に影響する要素:

- **音**: 歩行 < 走行 < 大声。マイク入力は壁越しでも聴覚AIへ届く
- **滞在時間**: 約10m圏内に留まり続けると危険圧が上昇。別エリアへ進むと大きく低下
- **レベル設定**: 0%の安全階層、通常階層、100%強制追跡の `Level !`
- **ライト**: `F` の懐中電灯を感知する敵は遠距離から反応
- **視線**: Wire entity は視界に入れている間ほぼ停止し、目を離すと急加速
- **遮蔽物**: 視覚判定は壁で遮られる一方、音は壁越しに伝わる
- **スポーン位置**: 通常時はなるべくプレイヤーの正面視界を避けた地点から出現

HUD の `THREAT` は単純な乱数の「スポーン確率」ではなく、現在の行動・滞在・音・ライトから算出した危険圧です。

### 9. 映像フィルター
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
| F | 懐中電灯 |
| M | 蛍光灯環境音 |
| K | マイク感知 |
| V | 映像フィルター切替 |
| Esc | メニュー |

## ローカル実行

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
- `bootstrap.js` — Three.js とゲームコードの読み込み
- `game-core.js` — レベル定義・世界生成・描画設定
- `game-logic.js` — パズル・危険圧・スポーン・敵AI
- `game-runtime.js` — マイク・音・画質調整・P2P接続
- `game-assets.js` — 同期補助・テクスチャ生成・起動処理
- `enemy-models.js` — 参考画像をもとに再構築した6種の軽量3Dエンティティ

## 注意

これはブラウザだけで成立する遊べるプロトタイプです。商用ゲームレベルの権威サーバー式AI、セーブ、専用マッチメイク、安定したインターネット越しのボイスチャット等は別途バックエンドが必要です。
