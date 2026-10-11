# ぼっちグルメ手帖（ぼっちグルメウーマン公式アーカイブ）

YouTube「ぼっちグルメウーマン」（@bocchi-g-women）で訪れたお店を、まち・ジャンル・予算から探せるサイト。

## 動かす

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に静的サイトを書き出し
```

## データ

| ファイル | 中身 | 更新方法 |
|---|---|---|
| `data/videos.json` | 全動画（タイトル・公開日・概要欄） | `npm run fetch`（APIキー不要） |
| `data/shops.yaml` | お店（1店舗＝1ブロック、再訪は visits に追加） | 手で編集 |
| `data/processed.json` | お店の抽出が済んだ動画 | 自動 |
| `data/geocache.json` | 位置検索のキャッシュ | 自動 |

### 毎日の自動更新（GitHub Actions）
`.github/workflows/daily-update.yml` が毎日 19:30（日本時間）に次を自動で行います。
1. `npm run fetch` … 新しい動画を取り込み
2. `npm run extract` … 新しい動画の概要欄から Claude（claude-opus-5-5）がお店・メニュー・価格を抜き出して `shops.yaml` に追加（再訪は既存店の visits に追加）
3. `npm run geocode` … Google マップ → 国土地理院 → OpenStreetMap の順で地図の位置を補完
4. ビルドが通ることを確認して、変更をコミット → Cloudflare Pages が自動で公開

手元で同じことをするなら `ANTHROPIC_API_KEY=... npm run update`。

### 公開の初期設定（最初の1回だけ）
1. GitHub で新しいリポジトリを作り、このフォルダを push
2. リポジトリの Settings → Secrets and variables → Actions → New repository secret
   - 名前 `ANTHROPIC_API_KEY`、値は https://console.anthropic.com/ で発行した API キー
3. Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Connect to Git でリポジトリを選ぶ
   - Framework preset: **Astro** / Build command: `npm run build` / Output directory: `dist`
4. Actions タブの daily-update → Run workflow で一度手動実行して動作確認

### 手で直したいとき
`data/shops.yaml` を直接編集して push すれば、そのまま公開に反映されます。
- 店名・ジャンル・閉店（`closed: true`）・ひとりの入りやすさ（`solo: 1〜3`）
- 地図の位置がずれていたら `lat` / `lng` を書き換えて `approx` の行を消す
- 載せたくないお店は `draft: true`
- お店を手で足すときの書き方:
  ```yaml
  - id: 好きな英数字（例: tsujiseimen）
    name: つじ製麺所
    pref: 青森県
    city: 青森市
    genre: ラーメン
    address: 青森県青森市○○1-2-3   # 分かれば
    visits:
      - videoId: YeTdd__osl4
        menu: [{name: かけラーメン, price: 500}]
        note: 朝7時から営業。無料の漬物＆揚げ玉も最高でした。
  ```

いまの `shops.yaml` は全836本の概要欄・タイトルから自動で整理したものです。店名の表記ゆれや、価格が分からないメニュー（price なし）が残っています。
