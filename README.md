# カルカソンヌ（タブレット用・ブラウザ版）

1台のタブレットを交代で操作して遊ぶカルカソンヌ。ログイン・インストール不要。

- 基本ゲーム72枚 ＋ 川12枚（カルカソンヌ21相当）。農夫（草原）の得点あり。修道院長は未実装。
- 2〜5人の交代プレイ。途中セーブ（端末内 localStorage）対応。「もどす」で手番の取り消し可。
- `index.html` … 画面、`engine.js` … ルールエンジン（Node でテスト可）、`test.js` … テスト

## 公開（GitHub Pages）

1. GitHub で公開リポジトリ `hkoby0326/carcassonne` を作り、この3ファイルを `main` に push
2. Settings › Pages › Build and deployment で Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にして保存
3. 数分後に https://hkoby0326.github.io/carcassonne/ で開ける。タブレットのブラウザでこのURLをホーム画面に追加すると使いやすい

## テスト

```
node test.js
```
