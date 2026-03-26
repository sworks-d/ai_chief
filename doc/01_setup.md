# 01 環境構築手順

## 必要なもの（用意するもの）

```
必須：
├── Claudeのサブスク（ProまたはMax）
│   → Claude Codeを動かすエンジン
├── X Developer Account（無料申請）
│   → X APIのアクセスキー取得
│   → https://developer.twitter.com/en/portal/dashboard
└── Metaアカウント（Threads API申請）
    → Threads自動投稿のため
    → https://developers.facebook.com/

あると便利：
└── GitHubアカウント（無料）
    → コードのバックアップ・バージョン管理
```

---

## STEP 1：Claude Codeをインストールする

### macOS / Linux

```bash
# ネイティブインストーラー（推奨・Node.js不要）
curl -fsSL https://claude.ai/install.sh | bash
```

### Windows

```powershell
# PowerShellで実行
irm https://claude.ai/install.ps1 | iex
```

> **Windowsの注意点**
> Claude CodeはWSL2（Windows Subsystem for Linux）が必要。
> WSL2がない場合は先にインストールすること。
> ```powershell
> wsl --install
> ```
> 再起動後、Ubuntuターミナルで上記のcurlコマンドを実行。

### インストール確認

```bash
claude --version
# バージョン番号が表示されればOK

claude doctor
# 環境チェック。問題があれば自動で報告してくれる
```

---

## STEP 2：認証する

```bash
claude
# 初回起動でブラウザが開く
# AnthropicアカウントでログインしてOKを押すだけ
```

---

## STEP 3：Node.jsをインストールする（MCP・エージェント用）

Claude Code本体にはNode.js不要だが、
エージェントシステムを動かすためにNode.js 18+が必要。

### macOS

```bash
# Homebrewがない場合
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.jsインストール
brew install node

# バージョン確認
node --version  # v18以上であればOK
npm --version
```

### Linux / WSL2

```bash
# nvmでインストール（推奨）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
node --version  # v20.x.x が表示されればOK
```

---

## STEP 4：プロジェクトフォルダを作る

```bash
# 任意の場所にフォルダを作成
mkdir s-project
cd s-project

# Claudeを起動
claude
```

---

## STEP 5：APIキーの取得（X・Threads）

### X（旧Twitter）API

1. https://developer.twitter.com/en/portal/dashboard にアクセス
2. 「Create Project」→「Create App」
3. 以下のキーを取得してメモ：
   - API Key
   - API Key Secret
   - Access Token
   - Access Token Secret
   - Bearer Token
4. App設定で「Read and Write」権限をONにする

### Threads API

1. https://developers.facebook.com/ にアクセス
2. Metaアカウントでログイン
3. 「My Apps」→「Create App」→「Business」を選択
4. Threads APIのアクセスを申請
5. 以下を取得：
   - App ID
   - App Secret
   - Long-lived Access Token

---

## STEP 6：環境変数を設定する

```bash
# プロジェクトフォルダに.envファイルを作成
touch .env

# 以下を.envに記入（テキストエディタで開いて記入）
X_API_KEY=ここにAPIキー
X_API_SECRET=ここにAPIシークレット
X_ACCESS_TOKEN=ここにアクセストークン
X_ACCESS_TOKEN_SECRET=ここにアクセストークンシークレット
X_BEARER_TOKEN=ここにベアラートークン

THREADS_APP_ID=ここにAppID
THREADS_APP_SECRET=ここにAppSecret
THREADS_ACCESS_TOKEN=ここにアクセストークン

ANTHROPIC_API_KEY=ここにAnthropicのAPIキー
```

> **重要：.envはGitにコミットしない**
> ```bash
> echo ".env" >> .gitignore
> ```

---

## STEP 7：Claude Codeでシステムを構築する

```bash
cd s-project
claude
```

Claude Codeが起動したら以下を指示：

```
このフォルダにAIエージェントシステムを構築してください。
仕様は doc/02_system_design.md を参照してください。
```

---

## フォルダ構成（完成形）

```
s-project/
├── doc/
│   ├── 01_setup.md         ← このファイル
│   ├── 02_system_design.md ← システム全体設計
│   ├── 03_knowledge.md     ← ナレッジファイル（キャラ・ターゲット・型）
│   ├── 04_agents.md        ← エージェント詳細設計
│   └── 05_ui.md            ← 承認UI設計
├── agents/
│   ├── researcher.js       ← リサーチャー
│   ├── fact_checker.js     ← ファクトチェッカー
│   ├── writer.js           ← ライター
│   ├── poster.js           ← ポスター
│   ├── fetcher.js          ← フェッチャー
│   └── analyst.js          ← アナリスト
├── knowledge/
│   ├── character.md        ← キャラクター定義
│   ├── target.md           ← ターゲット定義
│   ├── post_types.md       ← 投稿の型7つ
│   ├── scene_map.md        ← 関係者・シーンマップ
│   └── ng_words.md         ← NGワード・表現リスト
├── data/
│   ├── posts/              ← 投稿データ蓄積
│   ├── metrics/            ← メトリクスデータ
│   └── personas/           ← ターゲット人物像データ
├── ui/
│   └── approval.html       ← 承認UI
├── .env                    ← APIキー（Gitに含めない）
├── .gitignore
├── CLAUDE.md               ← Claude Codeへの指示ファイル
└── package.json
```

---

## トラブルシューティング

```
Q: claude コマンドが見つからない
A: ターミナルを再起動する。それでもダメなら
   export PATH="$HOME/.local/bin:$PATH" を ~/.bashrc に追加

Q: 認証が通らない
A: claude logout してから claude で再認証

Q: Node.jsのバージョンが古い
A: nvm install --lts && nvm use --lts

Q: npmでpermission error
A: sudo は使わない。nvmを使ってインストールすること
```
