# AI Video Shorter

セミナー動画からAIがパンチラインを自動抽出し、約5分のダイジェスト動画を生成するWebアプリ

# 構造

```
src/
  app/           # Next.js App Router (ページ、API)
  components/    # Reactコンポーネント
  lib/           # ユーティリティ (ffmpeg, whisper, claude, storage, job-store)
  inngest/       # Inngestジョブ定義
  types/         # 型定義
docs/            # 仕様書
```

# 技術スタック

- Next.js 15 (App Router) + TypeScript
- Inngest (ジョブキュー)
- OpenAI Whisper API (文字起こし)
- Claude API (パンチライン抽出)
- FFmpeg (動画編集)

# ローカル開発

**2つのサーバーを起動する必要がある:**

```bash
# ターミナル1: Next.js
npm run dev

# ターミナル2: Inngest Dev Server
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

- Next.js: http://localhost:3000
- Inngest ダッシュボード: http://localhost:8288

**Inngest Dev Server を起動しないとジョブが処理されない**

# 調査の順序（厳守）

コードベースを調査するときは **必ず** 以下の順序で進める。網羅的なコード走査を最初に行わないこと:

1. `docs/` — 仕様書で全体像・設計判断を把握
2. `CLAUDE.md` / `.claude/rules/` — 構成・ルールを確認
3. ソースコード — 上記で把握できない実装詳細だけを確認
