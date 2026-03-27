# Claude Codeへの引き継ぎ指示

## 現在の状況

### 動作確認済み（テスト完了）
- researcher.js ✅ 正常動作
- fact_checker.js ✅ 正常動作（軽微なパースエラーは自動スキップ）
- writer.js ✅ 正常動作（Sのキャラクター「知らんけど。」「笑」「体感で〜」が出ている）
- 品質スコア：全件7.8〜8.2でクリア

### 未対応（今回やること）
- poster.js・fetcher.js・analyst.js：未テスト
- 承認UI（server.js）：未起動
- モデル最適化：未適用
- プロンプトキャッシュ：未実装
- フィードバックループ：未実装

---

## 今回やってほしいこと（優先順位順）

### 1. 承認UIを起動して動作確認する

```bash
node server.js
```

- ブラウザで http://localhost:3000 を開く
- ui/approval.html が表示されること
- writer.jsが生成した投稿データがQUEUEに表示されること
- OK/NGボタンが動作すること

**ui/approval.htmlは最新デザイン済み（変更不要）**
**server.jsとui/approval.htmlをデータと繋ぎ込む実装が必要**

---

### 2. モデルをdoc/07_model_cost.mdの設定に最適化する

```
researcher.js    → claude-haiku-4-5-20251001
fact_checker.js  → claude-haiku-4-5-20251001
writer.js        → claude-sonnet-4-6（変更なし）
poster.js        → claude-haiku-4-5-20251001
fetcher.js       → claude-haiku-4-5-20251001
analyst.js       → claude-sonnet-4-6（変更なし）
```

---

### 3. writer.jsとanalyst.jsにプロンプトキャッシュを実装する

```javascript
// knowledge/フォルダの全ファイルをキャッシュ対象にする
// cache_control: { type: "ephemeral" } を使う
```

詳細はdoc/07_model_cost.mdを参照。

---

### 4. analyst.jsにフィードバックログへの自動追記を実装する

- 毎週月曜の週次分析時にdoc/08_feedback_log.mdへ追記する
- フォーマットはdoc/08_feedback_log.mdに記載されている通り

---

### 5. 全部完了したらGitHubにpushする

```bash
git add .
git commit -m "feat: UI integration + model optimization + cache + feedback loop"
git push origin main
```

---

## 参照すべきdocファイル（優先順位順）

| ファイル | 内容 |
|---|---|
| doc/10_active_rules.md | 現在有効なルール最新版（**最優先**） |
| doc/07_model_cost.md | モデル割り振り・コスト最適化設計 |
| doc/05_ui.md | 承認UIの仕様 |
| doc/08_feedback_log.md | フィードバックログのフォーマット |
| doc/04_agents.md | 各エージェントの詳細仕様 |
| doc/03_knowledge.md | キャラクター・ターゲット・投稿の型（初期定義） |

---

## 重要な注意事項

```
1. .envのAPIキーは絶対にコードに直書きしない
2. モデルはdoc/07_model_cost.mdの設定に従う（Opusは使わない）
3. ui/approval.htmlは変更しない（デザイン完成済み）
4. doc/10_active_rules.md > doc/03_knowledge.md の優先順位を守る
5. エラーが出ても自分で修正して再実行する
```
