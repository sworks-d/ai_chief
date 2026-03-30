# S — BRIEF / AIエージェントSNS自動発信システム

X（旧Twitter）へのAI情報自動収集・投稿生成・承認・発信システム。

---

## 起動

```bash
# 本番起動（cronスケジューラ + 承認UI）
npm start

# 承認UIのみ起動
npm run ui
```

起動後 → http://localhost:3005 で承認UIを開く

---

## 外部アクセス（スマホ・外出先から使う）

### 1. ngrokをインストール

```bash
brew install ngrok
```

### 2. ngrok アカウント登録 & トークン設定

1. https://ngrok.com でアカウント作成（無料）
2. ダッシュボードから Authtoken をコピー
3. 以下を実行：

```bash
ngrok config add-authtoken [YOUR_TOKEN]
```

### 3. トンネルを起動

```bash
# サーバーを起動した状態で別ターミナルで実行
npm run tunnel
```

表示された `https://xxxx.ngrok-free.app` のURLにアクセスする。

---

## 個別エージェント実行

```bash
node agents/researcher.js      # 情報収集
node agents/fact_checker.js    # ファクトチェック
node agents/writer.js          # 投稿生成
node agents/poster.js --force  # 即時投稿（時間帯スキップ）
node agents/fetcher.js 24h     # メトリクス取得
node agents/analyst.js daily   # 日次分析
```

---

## cronスケジュール

| 時刻 | 処理 |
|------|------|
| 05:00 | researcher（情報収集） |
| 06:30 | fact_checker |
| 06:45 | writer（投稿生成） |
| 07:30 | poster（朝枠・X） |
| 21:00 | poster（夜枠・X） |
| 毎時 | fetcher（メトリクス取得） |
| 01:00 | analyst（日次分析） |
| 月曜 06:00 | analyst（週次分析） |

---

## 環境変数（.env）

```
ANTHROPIC_API_KEY=
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
THREADS_USER_ID=          # 未設定でもOK（Threads無効化）
THREADS_ACCESS_TOKEN=     # 未設定でもOK（Threads無効化）
PORT=3005
```
