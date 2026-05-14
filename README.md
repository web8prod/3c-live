# 3C Live — 3C分析リアルタイム共同入力ツール

参加者がスマホ・PCから同時に書き込み、主催者がその場で集計と Claude AI による未来バリュープロポジション提案までできる Web ツールです。

- **管理画面** `/admin.html` — Web8 社員専用（パスワード保護）。セッションを作成・管理
- **実施画面** `/host.html?code=XXXXXX` — QRコード表示、参加者一覧、付箋ライブフィード
- **受講者画面** `/?code=XXXXXX` または `/room.html?code=XXXXXX` — 参加者が付箋投稿（顧客／競合／自社）
- **分析画面** `/analyze.html?code=XXXXXX` — キーワード集計、類似クラスター、AI 提案

スタック: **Vercel Hosting**（静的配信、無料）+ **Supabase**（PostgreSQL + Realtime、無料）

---

## デプロイ手順（初回のみ）

### 1. Supabase でテーブル作成

Supabase Console (https://supabase.com/dashboard) → プロジェクト `3c-live` を開く → 左サイドバー **SQL Editor** → **+ New query**

→ `supabase-schema.sql` の中身をまるごとコピペ → **Run** ボタンクリック

これで `rooms` / `notes` / `participants` テーブル + RLS ポリシー + Realtime 配信が一括設定されます。

### 2. GitHub にコードを push

```bash
cd 3c-realtime
git init
git branch -M main
git add -A
git commit -m "Initial commit: 3C Live (Supabase + Vercel)"
git remote add origin https://github.com/web8prod/3c-live.git
git push -u origin main
```

### 3. Vercel でデプロイ

https://vercel.com/web8prod を開く → **Add New… → Project** → GitHub の `web8prod/3c-live` を **Import** → デフォルト設定のまま **Deploy** をクリック

→ 30秒〜1分で `https://3c-live-xxxx.vercel.app/` の URL が払い出される

以降、`main` ブランチに push するたびに Vercel が自動再デプロイします。

---

## 運用

### パスワードを変更したい

`public/js/auth-guard.js` の `EXPECTED_HASH` 定数を新しいパスワードの SHA-256 ハッシュに置き換えて GitHub に push（→ Vercel 自動再デプロイ）。

ハッシュ算出（Mac の Terminal）:
```bash
printf '%s' '新パスワード' | shasum -a 256
```

出力された 64桁の hex 文字列を `EXPECTED_HASH` に貼り付けてコミット。

### Claude API キー（分析画面の AI 提案）

分析画面で各ファシリテータが自分の Anthropic API キー（`sk-ant-...`）を都度入力する方式です。キーはサーバを経由せず、ブラウザから Anthropic へ直接送信されます（`anthropic-dangerous-direct-browser-access` ヘッダ付き）。

API キーの取得: https://console.anthropic.com → API Keys → Create Key

### 独自ドメイン

`https://3c-live-xxxx.vercel.app` を `https://3c.web8.jp` 等に変えたい場合:

Vercel Dashboard → Project Settings → Domains → Add domain → 案内に従って DNS の CNAME を設定。

---

## ローカル開発

```bash
cd public
python3 -m http.server 8004
# → http://localhost:8004
```

Supabase クラウドの本番DBに接続するので、ローカルで投稿したデータも本番に反映される点に注意。

---

## アーキテクチャ

```
受講者ブラウザ ─┐
受講者ブラウザ ─┼─→ Supabase (Postgres + Realtime WebSocket)
主催ブラウザ   ─┘                  ↑
                                  │
        Vercel (静的JSをCDN配信)  ─┘
```

- **データ**: `public.rooms` / `public.notes` / `public.participants` の3テーブル
- **リアルタイム同期**: Supabase Realtime の `postgres_changes` チャンネル
- **認証**: Supabase 側は publishable key + RLS（全 read/write 許可）。アプリ層で管理画面パスワード + `hostToken`（部屋作成者の localStorage に保管）でガード

---

## ファイル構成

```
3c-realtime/
├── README.md
├── supabase-schema.sql       # 初回 SQL Editor で実行
├── vercel.json               # Vercel 設定
├── .gitignore
└── public/                   # Vercel が静的配信する範囲
    ├── index.html            # ホーム（参加者入口）
    ├── admin.html            # 管理画面（パスワード保護）
    ├── host.html             # 実施画面（投影用）
    ├── room.html             # 受講者画面（付箋投稿）
    ├── analyze.html          # 分析画面
    ├── css/style.css
    └── js/
        ├── supabase-config.js  # URL + anon key（Publishable）
        ├── store.js            # Supabase ラッパ（API は安定）
        ├── common.js           # CATEGORIES / 共通ヘルパー
        ├── auth-guard.js       # admin パスワードゲート
        ├── claude-client.js    # Anthropic API 直叩き
        ├── home.js / admin.js / host.js / room.js / analyze.js
```
