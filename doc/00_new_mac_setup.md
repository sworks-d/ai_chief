# 新しいMacでの環境構築手順

このファイルを読めば別のMacで同じ環境が再現できる。
所要時間：約20分。

---

## 事前に用意するもの

```
① GitHubアカウント（sworks-d）のアクセス権
② Anthropic APIキー（console.anthropic.com）
③ X APIキー一式（developer.twitter.com）
④ .envファイルの内容（元のMacからコピーしておく）
```

---

## STEP 1：Homebrewをインストール（入ってなければ）

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

インストール後にターミナルを再起動する。

---

## STEP 2：Node.jsをインストール

```bash
# nvmをインストール（Node.jsのバージョン管理ツール）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# ターミナルを再起動してから
source ~/.zshrc

# Node.jsの最新LTS版をインストール
nvm install --lts
nvm use --lts

# バージョン確認（v20以上が表示されればOK）
node --version
npm --version
```

---

## STEP 3：Claude Codeをインストール

```bash
# ネイティブインストーラーで一発インストール
curl -fsSL https://claude.ai/install.sh | bash

# ターミナルを再起動してから
source ~/.zshrc

# バージョン確認
claude --version

# 認証（ブラウザが開くのでAnthropicアカウントでログイン）
claude
```

---

## STEP 4：GitHubからリポジトリをclone

```bash
# 作業フォルダに移動（Documentsでも任意の場所でもOK）
cd ~/Documents

# cloneする
git clone https://github.com/sworks-d/ai_news.git

# フォルダに移動
cd ai_news
```

---

## STEP 5：npmパッケージをインストール

```bash
npm install
```

---

## STEP 6：.envファイルを作成

```bash
# .envファイルを作成
touch .env
open .env
```

テキストエディタが開いたら以下を貼り付けて保存：

```
# Anthropic API
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# X (Twitter) API
X_BEARER_TOKEN=xxxxxxxxxx
X_API_KEY=xxxxxxxxxx
X_API_SECRET=xxxxxxxxxx
X_ACCESS_TOKEN=xxxxxxxxxx
X_ACCESS_TOKEN_SECRET=xxxxxxxxxx
X_CLIENT_ID=xxxxxxxxxx
X_CLIENT_SECRET=xxxxxxxxxx

# Threads API（後で追加）
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_ACCESS_TOKEN=
```

※ 各キーの値は元のMacの.envファイルからコピーする。

---

## STEP 7：Macがスリープしないように設定

このMacを自走PCとして使うため、スリープを無効化する。

```
システム設定
→ ディスプレイ（またはバッテリー）
→「電源アダプタ接続時」
→「ディスプレイがオフの時にスリープさせない」をON
→「スクリーンセーバー開始後またはディスプレイがオフの後にパスワードを要求」をOFF
```

またはターミナルから：

```bash
# スリープ無効化（電源接続時）
sudo pmset -c sleep 0
sudo pmset -c disksleep 0
sudo pmset -c displaysleep 0

# 設定確認
pmset -g
```

---

## STEP 8：動作確認

```bash
cd ~/Documents/ai_news

# リサーチャーのテスト
node agents/researcher.js --test

# 承認UIの起動
node server.js
# ブラウザで http://localhost:3000 を開く

# 本番起動（全エージェント自動起動）
node index.js
```

---

## STEP 9：自動起動設定（Mac再起動後も動くように）

MacのLaunchDaemonを使って、起動時に自動でnode index.jsが動くようにする。

```bash
# 自動起動設定ファイルを作成
cat > ~/Library/LaunchAgents/com.s-project.ai-news.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.s-project.ai-news</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOUR_USERNAME/Documents/ai_news/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/YOUR_USERNAME/Documents/ai_news</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/YOUR_USERNAME/Documents/ai_news/logs/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR_USERNAME/Documents/ai_news/logs/stderr.log</string>
</dict>
</plist>
EOF

# YOUR_USERNAMEを実際のユーザー名に置換
# 例：sed -i '' 's/YOUR_USERNAME/shotaro/g' ~/Library/LaunchAgents/com.s-project.ai-news.plist

# logsフォルダを作成
mkdir -p ~/Documents/ai_news/logs

# 自動起動を登録
launchctl load ~/Library/LaunchAgents/com.s-project.ai-news.plist

# 動作確認
launchctl list | grep s-project
```

---

## STEP 10：元のMacからファイルをコピー（必要に応じて）

元のMacで蓄積されたデータを引き継ぐ場合：

```bash
# 元のMacから新しいMacにデータをコピー（同じWi-Fi上で）
# 元のMacで実行：
scp -r ~/ai_news/data/ 新しいMacのIPアドレス:~/Documents/ai_news/data/

# または元のMacでGitHubにpushしてから新しいMacでpull
# 元のMac：
git add data/ && git commit -m "backup: data sync" && git push

# 新しいMac：
git pull origin main
```

---

## トラブルシューティング

```
Q：claude コマンドが見つからない
A：source ~/.zshrc を実行してターミナルを再起動

Q：node コマンドが見つからない
A：nvm use --lts を実行

Q：npm install でエラーが出る
A：node --version が v18以上か確認。古ければ nvm install --lts

Q：APIエラーが出る
A：.envのキーが正しいか確認。
   cat .env で内容を確認（値が空になっていないか）

Q：自動起動が動かない
A：launchctl list | grep s-project で状態確認
   ログを確認：cat ~/Documents/ai_news/logs/stderr.log
```

---

## 毎日の確認方法

```bash
# プロセスが動いているか確認
ps aux | grep "node index.js"

# ログを確認
tail -f ~/Documents/ai_news/logs/stdout.log

# 今日の投稿を確認
ls ~/Documents/ai_news/data/posts/$(date +%Y-%m-%d)/

# 承認UIを開く
open http://localhost:3000
```
