# 13 運用前100点チェックリスト

このファイルをClaude Codeに渡して、全項目を上から順番に実装・確認・修正してください。
完了した項目は [ ] を [x] に変えてください。
エラーが出た場合は自分で修正して再実行し、完了させてください。

---

## 実行方法

```bash
git pull origin main
```

このファイルを読んで、A→B→C→D→Eの順番で全項目を実行してください。
全部完了したら最後にgit pushしてください。

---

## A：エージェントの実装品質

### A-1 モデル設定の確認・修正

各エージェントのmodel指定を確認して修正する。

```
正しい設定：
├── agents/researcher.js → claude-haiku-4-5-20251001
├── agents/fact_checker.js → claude-haiku-4-5-20251001
├── agents/writer.js → claude-sonnet-4-6（変更禁止）
├── agents/poster.js → claude-haiku-4-5-20251001
├── agents/fetcher.js → claude-haiku-4-5-20251001
└── agents/analyst.js → claude-sonnet-4-6（変更禁止）
```

確認コマンド：
```bash
grep -n "model" agents/*.js
```

- [ ] researcher.js のモデルがHaikuになっている
- [ ] fact_checker.js のモデルがHaikuになっている
- [ ] writer.js のモデルがSonnetになっている
- [ ] poster.js のモデルがHaikuになっている
- [ ] fetcher.js のモデルがHaikuになっている
- [ ] analyst.js のモデルがSonnetになっている

---

### A-2 プロンプトキャッシュの実装

writer.jsとanalyst.jsに実装する。
knowledge/フォルダの全ファイルをキャッシュ対象にする。

実装方法：
```javascript
// システムプロンプトにcache_controlを追加
{
  type: "text",
  text: knowledgeContent,
  cache_control: { type: "ephemeral" }
}
```

- [ ] writer.js にプロンプトキャッシュが実装されている
- [ ] analyst.js にプロンプトキャッシュが実装されている

---

### A-3 writer.js：SHORT型・THREAD型の自動判断

doc/10_active_rules.mdの「投稿フォーマット設計」に従って実装する。

```
SHORT型（1投稿完結）：手順が2以下・140字前後で完結できる内容
THREAD型（4投稿セット）：手順が3以上・ソース説明+現場応用が必要

THREAD型の4投稿構成：
投稿1：問題提起 + 「気になる人はリプ欄へ」
投稿2：具体的な手順（番号付き）
投稿3：実際の結果・数字・プロンプトの一部だけ見せる（全部は見せない）
投稿4：Sの本音（カウンター）+ noteへの誘導「全文はnoteに置いてます」
```

- [ ] writer.js がSHORT型・THREAD型を自動判断して生成している
- [ ] THREAD型の場合は4投稿をセットでQUEUEに追加している

---

### A-4 writer.js：doc/10_active_rules.mdのルールを全て反映

以下のルールがwriter.jsのシステムプロンプトに全て含まれているか確認・修正する。

```
確認するルール：
├── ソース明示：「〜が発表」「実際にやってみたら」「まだ確認中だけど」
├── tips具体化：手順は番号付き・結果は「修正3回→0回」レベルの数字で
├── noteへの誘導：全部見せない・一部だけ見せて「残りはnoteで」
├── 1行目のルール：体験から入る・疑問形・数字（宣言型禁止）
├── カウンター構造：強い言葉の後に「笑」「知らんけど」「たぶん」
├── 締め方：シーンが浮かぶ行動・問いかけ・独り言
├── 禁止ワード：「絶対」「必ず」「参考になれば幸いです」等
└── 週の投稿密度：月問題提起・火tips・水THREAD・木比較・金本音・土問いかけ
```

- [ ] 上記の全ルールがwriter.jsのシステムプロンプトに反映されている

---

### A-5 analyst.js：週次分析でdoc/08_feedback_log.mdへの自動追記

毎週月曜6:00の週次分析完了後に、以下のフォーマットで追記する。

```markdown
## YYYY-WW（年-週番号）

### 今週伸びたパターン
- 型：〜 × テーマ：〜 × 関係者：〜
  理由（仮説）：〜

### 今週伸びなかったパターン
- 型：〜 × テーマ：〜
  理由（仮説）：〜

### 意外な発見
- 〜

### ルール化の提案（Sの判断待ち）
- [ ] 〜をdoc/10_active_rules.mdに追加する
```

- [ ] analyst.js が週次分析後にdoc/08_feedback_log.mdへ自動追記する

---

### A-6 researcher.js：XのバズAI投稿収集

X API Free Tierの制限に対応した実装にする。
エラーになった場合はスキップしてログに記録するだけでOK。

```
収集条件：
├── キーワード：生成AI・AIデザイン・Midjourney・Runway・Claude・AIクリエイター
├── 直近24時間以内
├── いいね30以上（プチバズ）・100以上（バズ）
├── 日本語優先（lang:ja）
└── リツイート除外

出力フォーマットに追加：
├── source_type: "SNS"
├── platform: "x"
├── likes: いいね数
├── buzz_level: "バズ" or "プチバズ"
└── author: "@ユーザー名"
```

- [ ] researcher.js がXのバズ投稿を収集している（Free Tier制限時はスキップ）

---

### A-7 researcher.js：日別保存の設計に変更

前日データを上書きしない。日別に蓄積する。

```bash
# 保存先を変更：
data/research/YYYY-MM-DD.json

# 確認：
ls data/research/
```

- [ ] researcher.js が data/research/YYYY-MM-DD.json に日別保存している
- [ ] /api/research?date=YYYY-MM-DD で指定日のデータを返せる

---

### A-8 全エージェント：people_insights.jsonの参照

doc/12_people_feedback.mdの設計に従って全エージェントに反映する。

```
researcher.js：
  data/people_insights.jsonが存在する場合
  WATCHリストのアカウントを情報収集の優先ソースとして巡回する
  source_type: "PEOPLE_WATCH" として通常の収集結果に追加

fact_checker.js：
  WATCHリストのHIGH信頼アカウントが発信してる情報は
  trust_levelをワンランク上げる（LOW→MID・MID→HIGH）

analyst.js：
  週次分析でdata/engage_log.jsonを参照
  「絡んだアカウントのタイプとフォロワー増加の相関」を分析
  結果をdoc/08_feedback_log.mdに追記

writer.js：
  data/people_insights.jsonの最新5件をシステムプロンプトに追加
  「今バズってる型・キーワード」として参照
```

- [ ] researcher.js がpeople_insights.jsonのWATCHリストを優先ソースとして参照している
- [ ] fact_checker.js がHIGH信頼アカウントの信頼度を上げている
- [ ] analyst.js が絡んだログとフォロワー増加の相関を分析している
- [ ] writer.js がpeople_insights.jsonをシステムプロンプトに追加している

---

### A-8b PEOPLEパネル「投稿を分析」機能の実装

doc/12_people_feedback.mdの「投稿を分析」の詳細仕様に従って実装する。
これはライターだけでなく全エージェントへのFBの起点となる最重要機能。

```
処理フロー：

1. PEOPLEパネルの各カードで「投稿を分析」ボタンをクリック

2. X APIでそのアカウントの直近投稿を20件取得する
   GET /2/users/:id/tweets
   パラメータ：max_results=20, tweet.fields=public_metrics,created_at
   ※ Free Tier制限でエラーの場合はスキップしてSに通知する

3. POST /api/people/analyze を叩いてanalyst.jsに分析を依頼する
   analyst.jsがClaudeに以下を分析させる（Sonnetモデル使用）：

   分析内容：
   ① 1行目の構造パターン（疑問形・数字・体験談・断言のどれが多いか）
   ② 投稿の型の傾向（比較・正直・tips・問いかけ・体験談）
   ③ 頻出キーワード・フレーズ・特徴的な語尾
   ④ いいねが多い投稿と少ない投稿の差（何が違うか）
   ⑤ Sのジャンル（AI×クリエイター・制作現場）に置き換えた投稿例を1本生成

4. 分析結果をdata/people_insights.jsonに保存する
   フォーマット：doc/12_people_feedback.mdの「data/people_insights.jsonのフォーマット」参照

5. UIに分析結果を表示する
   カードを展開して以下を表示：
   - バズパターンのサマリー（1行）
   - よく使う型・頻出キーワード
   - Sのジャンルで生成した投稿例

6. 「この分析を全エージェントに反映する」ボタンを表示
   クリックするとdata/people_insights.jsonを保存・全エージェントが次回から参照する
```

APIエンドポイント：
```
POST /api/people/analyze
body: { account: "@handle", tweets: [...取得した投稿データ] }
→ analyst.jsが分析してdata/people_insights.jsonに追記して返す
```

- [ ] 「投稿を分析」ボタンがPEOPLEパネルの各カードに存在している
- [ ] X APIで対象アカウントの直近投稿を取得できる（Free Tier制限時はスキップ）
- [ ] analyst.jsがバズ投稿を分析してdata/people_insights.jsonに保存する
- [ ] 分析結果がUIのカード内に表示される
- [ ] 「全エージェントに反映」ボタンで全エージェントが次回から参照する

---

### A-9 fetcher.js：Free Tier制限対応

メトリクス取得がエラーになった場合はスキップしてログに記録するだけ。
投稿機能に影響しない設計になっているか確認する。

- [ ] fetcher.js がFree Tier制限エラー時にスキップして継続する
- [ ] エラーログがdata/logs/fetcher-error.jsonに記録される

---

### A-10 Threads未設定時のスキップ

.envにTHREADS_ACCESS_TOKENが設定されていない場合、
全エージェントでThreads関連処理をスキップする。

```javascript
// 全エージェントで確認するパターン
const threadsEnabled = !!process.env.THREADS_ACCESS_TOKEN;
if (threadsEnabled) {
  // Threads処理
} else {
  console.log('Threads未設定のためスキップ');
}
```

- [ ] poster.js がThreads未設定時にXのみ投稿してスキップする
- [ ] writer.js がThreads未設定時にThreads用投稿文を生成しない
- [ ] cronスケジュールでThreadsスロットが適切に処理されている

---

## B：UIの確認・修正

### B-1 基本UIの動作確認

```bash
node server.js
```

http://localhost:3001 を開いて以下を全て確認する。

```
INPUTパネル：
├── 全件スクロールで20件以上表示されるか
├── 「注目」と「すべて」のセクション分けがあるか
├── 昨日タブで前日のデータに切り替えられるか
├── 🔖ボタンでブックマークできるか
└── 「保存済み」タブにブックマークした記事が表示されるか

QUEUEパネル：
├── 未承認・承認済みタブが切り替えられるか
├── OK/NGボタンが動作するか
├── 承認済みカードに編集・削除・今すぐ投稿ボタンがあるか
└── 編集がその場でできるか（テキストエリアに切り替わるか）

DATAパネル：
├── 昨日の数字が表示されるか（データがある場合）
├── HISTORYセクションが存在するか
└── 投稿後にHISTORYに表示されるか

PEOPLEパネル：
├── 4つ目のパネルとして表示されるか
├── WATCH・ENGAGE・SIMILARタブが切り替えられるか
├── 各カードに「フォロー済」「絡んだ」「投稿を分析」ボタンがあるか
└── スマホの底部ナビにPEOPLEタブが追加されているか

ヘッダー：
├── タイトルが「余白のAI」になっているか
└── Anthropic残高・X API残量が表示されているか
```

動作しないものは修正する。

- [ ] INPUTパネル全件表示が動作している
- [ ] INPUTパネル昨日タブが動作している
- [ ] INPUTパネルブックマークが動作している
- [ ] QUEUEパネル未承認・承認済みタブが動作している
- [ ] QUEUEパネル編集・削除・今すぐ投稿が動作している
- [ ] DATAパネルHISTORYセクションが存在している
- [ ] PEOPLEパネルが4つ目のパネルとして存在している
- [ ] PEOPLEパネル3タブが動作している
- [ ] ヘッダーにAPI残量が表示されている

---

### B-2 マニュアルページの確認

```bash
# server.jsが起動してる状態で
open http://localhost:3001/manual
```

- [ ] http://localhost:3001/manual でマニュアルページが開く
- [ ] 「← ダッシュボードに戻る」リンクが動作する

---

### B-3 API残量表示の実装

server.jsに /api/status エンドポイントを追加する。

```javascript
GET /api/status
→ 返すデータ：
{
  "anthropic": {
    "balance": XX.XX  // Anthropic Consoleから取得
  },
  "x": {
    "posts_remaining": XXX,   // poster.jsがレスポンスヘッダーから記録
    "posts_limit": 1500,
    "reset_date": "YYYY-MM-01"
  }
}
```

Anthropic残高：https://api.anthropic.com/v1/organizations/me から取得
X残量：poster.jsが投稿のたびにx-rate-limit-remainingを data/api_status.json に保存

```
警告表示：
├── Anthropic残高 $3以下 → amber色
├── X残量 200以下 → amber色
└── どちらかが0 → red色でアラート
```

- [ ] /api/status エンドポイントが動作している
- [ ] ヘッダーにAnthropicの残高が表示されている
- [ ] ヘッダーにX APIの残量が表示されている

---

## C：設計書の整合性

### C-1 CLAUDE.mdの更新

参照ファイルリストにdoc/12_people_feedback.mdを追加する。

```
| doc/12_people_feedback.md | PEOPLEパネル・投稿FBループ設計（必読） |
```

- [ ] CLAUDE.mdにdoc/12_people_feedback.mdが追加されている

---

### C-2 HANDOVER.mdの最新化

現在の実装状況を反映した内容に更新する。

```
記載する内容：
├── 動作確認済みのエージェント一覧
├── 未完了・未確認の項目
├── 既知の問題（Free Tier制限等）
└── 次にやること
```

- [ ] HANDOVER.mdが現在の実装状況に合わせて更新されている

---

### C-3 doc/13_checklist.md（このファイル）のチェック状況更新

全項目の [ ] を実行結果に合わせて [x] または [!エラー] に更新する。

- [ ] このファイル自体が完了・未完了・エラーで更新されている

---

## D：インフラ確認

### D-1 package.jsonのscripts確認

```bash
cat package.json | grep -A 5 '"scripts"'
```

以下のscriptsが設定されているか確認・修正する：
```json
"scripts": {
  "start": "node index.js",
  "ui": "node server.js",
  "tunnel": "ngrok http 3001"
}
```

- [ ] npm start で node index.js が起動する
- [ ] npm run ui で node server.js が起動する
- [ ] npm run tunnel で ngrok http 3001 が起動する

---

### D-2 .gitignoreの確認

```bash
cat .gitignore
```

以下が含まれているか確認：

```
.env
node_modules/
data/posts/
data/metrics/
data/personas/
data/api_status.json
data/engage_log.json
*.log
```

- [ ] .envが.gitignoreに含まれている
- [ ] node_modulesが.gitignoreに含まれている
- [ ] 蓄積データフォルダが.gitignoreに含まれている

---

### D-3 .envの必須キー確認

```bash
# キーが設定されてるか確認（値は表示しない）
cat .env | grep "=" | sed 's/=.*/=***/'
```

以下のキーが全て設定されているか確認：

```
必須：
├── ANTHROPIC_API_KEY
├── X_BEARER_TOKEN
├── X_API_KEY
├── X_API_SECRET
├── X_ACCESS_TOKEN
├── X_ACCESS_TOKEN_SECRET
├── X_CLIENT_ID
└── X_CLIENT_SECRET

任意（未設定でもスキップするだけ）：
├── THREADS_APP_ID
├── THREADS_APP_SECRET
└── THREADS_ACCESS_TOKEN
```

- [ ] 必須キーが全て.envに設定されている

---

### D-4 data/フォルダ構成の確認

```bash
find data/ -name ".gitkeep" -o -name "*.json" | head -20
```

以下のフォルダ構成になっているか確認・修正する：

```
data/
├── posts/（.gitkeep）
├── metrics/（.gitkeep）
├── personas/（.gitkeep）
├── research/（日別jsonが入る予定）
├── logs/（.gitkeep）
└── people_cache.json（初期データ・後述）
```

data/people_cache.jsonを以下の内容で作成する（初期データ）：

```json
{
  "updated_at": "2026-03-27T00:00:00Z",
  "watch": [
    {
      "account": "@ai_design_jp",
      "name": "AIデザイン研究所",
      "follower_count": 12000,
      "description": "AI×デザイン・制作現場の情報を発信。Sのターゲット層と読者が被る。",
      "trust_level": "HIGH",
      "overlap": "HIGH",
      "post_frequency": "毎日",
      "latest_buzz": "Midjourney v6でクライアントワーク、実際どこまで使えるか試した。",
      "latest_likes": 850,
      "analyst_comment": "現場目線の投稿が多い。1行目が疑問形の投稿が特に伸びてる。"
    },
    {
      "account": "@creative_ai_pro",
      "name": "クリエイティブAIプロ",
      "follower_count": 28000,
      "description": "広告・映像・WEB制作でのAI活用を発信。フォロワーの8割がクリエイター。",
      "trust_level": "HIGH",
      "overlap": "HIGH",
      "post_frequency": "週3",
      "latest_buzz": "代理店のソルジャー案件にAIを投入してみた結果。",
      "latest_likes": 1200,
      "analyst_comment": "Sと近い立場から発信してる競合。バズパターンの参考になる。"
    },
    {
      "account": "@ai_copyright_jp",
      "name": "AI著作権ウォッチ",
      "follower_count": 8500,
      "description": "AI著作権・法律動向の専門的な解説。信頼度が高い情報源。",
      "trust_level": "HIGH",
      "overlap": "MID",
      "post_frequency": "週2",
      "latest_buzz": "EU AI Act、日本への影響を整理した。",
      "latest_likes": 620,
      "analyst_comment": "著作権情報の一次ソースとして信頼度が高い。"
    }
  ],
  "engage": [],
  "similar": [
    {
      "account": "@ai_marketing_tips",
      "name": "AIマーケティングtips",
      "follower_count": 35000,
      "description": "マーケ視点のAI活用。情報量は多いが現場感が薄い。",
      "trust_level": "MID",
      "overlap": "MID",
      "strength": "情報の網羅性・更新頻度",
      "weakness": "現場感がない・再現性が低い",
      "differentiation": "Sは現場リアル・再現できる手順を出す"
    },
    {
      "account": "@ai_engineer_note",
      "name": "AIエンジニアnote",
      "follower_count": 45000,
      "description": "エンジニア視点のAI解説。技術的すぎてクリエイター向けではない。",
      "trust_level": "HIGH",
      "overlap": "LOW",
      "strength": "技術的正確性・フォロワー数",
      "weakness": "クリエイター向けじゃない・抽象的",
      "differentiation": "Sはクリエイター専門・ツールの実務利用に特化"
    }
  ]
}
```

- [ ] data/research/フォルダが存在している
- [ ] data/logs/フォルダが存在している
- [ ] data/people_cache.jsonが作成されている

---

## E：動作テスト

### E-1 各エージェントの単体テスト

以下を順番に実行して、全て正常動作することを確認する。

```bash
# リサーチャー
node agents/researcher.js --test
# → 情報収集結果がdata/research/YYYY-MM-DD.jsonに保存されること

# ファクトチェッカー
node agents/fact_checker.js --test
# → TYPE A/B/C/D判定が出ること

# ライター
node agents/writer.js
# → QUEUEに投稿が追加されること（X用のみ・Threads未設定はスキップ）
# → SHORT型とTHREAD型が判断されて生成されること
# → 品質スコアが7.0以上であること

# フェッチャー
node agents/fetcher.js --test
# → メトリクス取得またはスキップのどちらかが正常に動作すること

# アナリスト（強制実行）
node agents/analyst.js --force
# → 分析結果が出力されること
```

- [ ] researcher.js --test が正常終了する
- [ ] fact_checker.js --test が正常終了する
- [ ] writer.js が投稿を生成してQUEUEに追加する
- [ ] fetcher.js --test が正常終了（またはスキップ）する
- [ ] analyst.js --force が正常終了する

---

### E-2 UIの統合テスト

```bash
node server.js
```

以下を順番に確認する：

```
1. http://localhost:3001 が開く
2. INPUTパネルに今日のリサーチ結果が表示される
3. QUEUEのwriter.jsで生成した投稿が表示される
4. OKボタンを押すと承認済みタブに移動する
5. PEOPLEパネルにWATCHリストが表示される
6. DATAパネルにAPIステータスが表示される
7. http://localhost:3001/manual が開く
```

- [ ] 全て正常に動作している

---

### E-3 本番起動テスト

```bash
npm start
```

以下を確認する：
- cronスケジュールが設定通りに登録されていること
- 「余白のAI が起動しました」のメッセージが表示されること
- http://localhost:3001 が開くこと

- [ ] npm start で全エージェントが起動する
- [ ] cronスケジュールが正常に登録されている

---

### E-4 Xへの投稿テスト（最終確認）

```bash
node agents/poster.js --force
```

@S_creative_AIに実際に投稿されることを確認する。
投稿されたらUIのHISTORYに表示されることを確認する。

- [ ] Xに実際に投稿される
- [ ] 投稿後にDATAパネルのHISTORYに表示される

---

## 完了後の処理

全項目が完了したら以下を実行する：

```bash
git add .
git commit -m "feat: pre-launch 100pt checklist complete"
git push origin main
```

完了・未完了・エラーの状況をSに報告する。
