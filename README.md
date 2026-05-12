# lunchnet-status-page

ランチネット「本日の出店状況」公開ページ（お客様向け・公式LINEからのみ案内）。

- 公開URL: `https://status.lunchnetsalessystem.com`（Cloudflare Pages・Production branch = `main`）
- 中身は静的ファイルのみ（ビルド不要）。Cloudflare のエッジで配信するので、お客様アクセスは社内システム（Heroku）に一切かからない。
- `status.json` は社内システム側（`lunchnetsalessystem` リポジトリ）の Django 管理コマンド `generate_status_json` が **毎朝8時ごろ**に生成し、このリポジトリの `main` へ push → Cloudflare Pages が自動デプロイ。
  - `ItemQuantity`（その日に各拠点へ持っていく弁当数）の本日合計が 1 以上 → `"open"`（出店予定）、0／レコード無し → `"closed"`（本日はお休み）
  - 土日祝（`jpholiday`）は `business_day: false`
  - 営業日なのに全拠点0（持参数未登録の可能性）は `all_unregistered: true`

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | ページ本体 |
| `style.css` | スタイル（お客様向け・社内システムとは別デザイン） |
| `app.js` | `status.json` を読んで描画。データが今日の分でない / 取得失敗時はフォールバック表示 |
| `status.json` | 出店状況データ（Heroku 側が上書き push する） |
| `robots.txt` / `_headers` | `noindex`（meta robots と二重） |

## status.json のスキーマ

```json
{
  "date": "2026-05-12",
  "weekday": "火",
  "business_day": true,
  "generated_at": "2026-05-12T08:00:30+09:00",
  "all_unregistered": false,
  "locations": [
    { "no": 1, "name": "新木場", "status": "open" },
    { "no": 2, "name": "シーサイド", "status": "closed" }
  ]
}
```

詳細仕様: `lunchnetsalessystem` 側ではなく Levo. の `.company/engineering/harness/specs/w001-本日の出店状況ページ.md`（要件の正本）。
