# Claude Codeへの現状引き継ぎ

まずdoc/フォルダの全ファイルを読んでください。
特にdoc/10_active_rules.md（最優先）を必ず読むこと。

読み終わったら以下の現状を把握して、動作確認を優先して進めてください。

---

## 現在の動作状況（2026-03-27更新）

### 動作確認済み ✅
- researcher.js：正常動作（モデル: claude-haiku-4-5-20251001）
- fact_checker.js：正常動作（モデル: claude-haiku-4-5-20251001）
- writer.js：正常動作（SHORT/THREAD型判断・土曜問いかけ投稿・型優先順位⑤⑥⑦実装済み）
- poster.js：正常動作（--force実装・スレッド投稿reply chaining対応済み）
- fetcher.js：正常動作（Free Tier制限スキップ・エラーログ記録）
- analyst.js：正常動作（メトリクスなし時スキップ）
- server.js：正常動作（承認UI PORT=3001）
- node index.js：正常動作（cronスケジュール + 承認UIサーバー同時起動）
- X実投稿：成功済み https://twitter.com/i/web/status/2037376178789728549

### 未実装（優先⑤以降）
- モデル最適化（doc/07_model_cost.md参照）
- プロンプトキャッシュ（writer.js・analyst.js）
- フィードバックループ（analyst.js → doc/08_feedback_log.md自動追記）
- 週の投稿密度設計（Phase 2・doc/10_active_rules.md参照）
- Threads APIキー設定（.envに空欄のまま）

---

## 起動コマンド

```bash
cd /Users/a05/Documents/GitHub/ai_news

# 本番起動（これだけでOK）
node index.js
# → http://localhost:3001 で承認UIが開く

# 個別テスト
node agents/researcher.js --test
node agents/fact_checker.js --test
node agents/writer.js --test
node agents/poster.js --test     # テストモード（実投稿なし）
node agents/poster.js --force    # 時間帯スキップして実投稿
node agents/fetcher.js --test
node agents/analyst.js --test
```

---

## 環境情報

| 項目 | 値 |
|---|---|
| パス | /Users/a05/Documents/GitHub/ai_news |
| ポート | 3001 |
| Xアカウント | @S_creative_AI |
| writer/analystモデル | claude-sonnet-4-6 |
| researcher/fact_checkerモデル | claude-haiku-4-5-20251001 |

---

## 既知の問題・対応済み

| 問題 | 対応 |
|---|---|
| X APIのFree Tierでメトリクス取得不可 | fetcher.jsでスキップ＋errors_DATE.jsonに記録 |
| analyst.jsがメトリクスなしでClaudeを呼ぶ | 空/全ゼロの場合はスキップ対応済み |
| Xの日本語ツイートが280文字制限オーバー | writer.jsのX制限を140文字に修正・重み付きチェック追加 |
| Claude APIがJSON不正形式を返す | fact_checkerはtry/catchで対処済み |
| Threads APIは未設定 | poster.jsはXのみ投稿（Threadsはスキップ） |
| THREAD型生成が品質スコア7.0未満になることあり | SHORT型にフォールバック済み |

---

## doc/10_active_rules.mdの実装状況

| ルール | 実装状況 |
|---|---|
| モデル設定（haiku/sonnet分離） | ✅ |
| 品質スコア7.0未満は捨てる | ✅ |
| 型⑤⑥⑦優先 | ✅ |
| SHORT/THREAD型判断 | ✅ |
| THREAD型4投稿セット生成 | ✅ |
| 土曜問いかけ投稿 | ✅ |
| 週の投稿密度設計 | ❌ Phase 2 |
| フィードバックループ | ❌ 未実装 |

---

## 別PCへの引き継ぎ・外部ネットワークアクセス設定

### 別PCでの環境構築
doc/00_new_mac_setup.md に全手順あり。要約：

```bash
curl -fsSL https://claude.ai/install.sh | bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc && nvm install --lts
git clone https://github.com/sworks-d/ai_news.git
cd ai_news && npm install
touch .env && open .env   # 元のMacからキーをコピー
sudo pmset -c sleep 0     # スリープ無効化
node index.js             # 起動
```

---

### 外部ネットワーク（5G・外出先）からUIにアクセスする

ngrokを使う。

```bash
# 初回のみ：インストール・認証
brew install ngrok
# https://ngrok.com でSign up → Auth tokenをコピー
ngrok config add-authtoken ここにトークンを貼る

# 毎朝の起動手順
# ターミナル1：
node index.js

# ターミナル2：
ngrok http 3001
# → https://xxxx.ngrok-free.app が発行される
# → このURLをスマホで開けば5GからでもUIにアクセスできる
```

制限（無料プラン）：
- URLが毎回変わる（毎朝コピーが必要）
- 月40時間まで

Proプラン（月$10）で固定URLになる。

---

### package.jsonのscriptsを以下に更新してほしい

```json
"scripts": {
  "start": "node index.js",
  "ui": "node server.js",
  "tunnel": "ngrok http 3001"
}
```

npm start → 本番起動
npm run ui → UIのみ（テスト用）
npm run tunnel → ngrok起動（別ターミナルで）

完了したらgit pushしてください。
