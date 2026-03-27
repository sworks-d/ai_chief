# Claude Codeへの現状引き継ぎ

まずdoc/フォルダの全ファイルを読んでください。
特にdoc/10_active_rules.md（最優先）を必ず読むこと。

読み終わったら以下の現状を把握して、動作確認を優先して進めてください。

---

## 現在の動作状況

### 動作確認済み
- researcher.js：正常動作
- fact_checker.js：正常動作（軽微なパースエラーは自動スキップ）
- writer.js：正常動作（品質スコア7.8〜8.2・Sのキャラクターが出ている）

### 未確認・未対応
- server.js（承認UI）：未起動
- poster.js：テスト未完了
- fetcher.js：テスト未完了
- analyst.js：テスト未完了
- モデル最適化：未適用
- プロンプトキャッシュ：未実装
- フィードバックループ：未実装

---

## 今回やること（動作確認を最優先）

### 優先①：承認UIの起動・動作確認

```bash
node server.js
```

確認項目：
- http://localhost:3000 でui/approval.htmlが表示されること
- writer.jsが生成した投稿データがQUEUEパネルに表示されること
- OK/NGボタンが動作してキューに反映されること

⚠️ ui/approval.htmlは変更しない（デザイン完成済み）
⚠️ server.jsとui/approval.htmlのデータ連携だけ実装する

---

### 優先②：poster.jsの動作確認（Xへの投稿テスト）

以下の修正をしてからテストする：

1. poster.jsに「--force」フラグを追加（時間帯スロットを無視してテストできるように）
2. Threads APIが.envに未設定の場合はXだけ投稿してスキップする（エラーにしない）

```bash
node agents/poster.js --force
```

---

### 優先③：fetcher.jsの動作確認

X APIのFree Tier制限でメトリクス取得がエラーになる場合は：
- エラーログだけ残してスキップする
- 投稿機能には影響しない設計にする

---

### 優先④：本番起動テスト

上記が全部動いたら：

```bash
node index.js
```

全エージェントがcronで自動起動することを確認する。

---

### 優先⑤：①〜④が全部動いたら実装（後回しでOK）

- モデル最適化（doc/07_model_cost.md参照）
- プロンプトキャッシュ（writer.js・analyst.js）
- フィードバックループ（analyst.js → doc/08_feedback_log.md自動追記）

---

## 既知の問題・注意事項

### poster.jsのスロット問題
poster.jsのスロット設定：
- 7:00〜9:00   → Xのみ
- 12:00〜14:00 → Threadsのみ
- 21:00〜23:00 → X + Threads
- その他       → X + Threads

Threadsの.envが未設定のため、Threadsスロットの時間帯はエラーになる。
→ Threads未設定時はXだけ投稿する設計に変更すること。

### X API Free Tier
- 投稿（POST）：月1,500件 → 問題なし
- メトリクス取得（GET）：制限あり → エラー時はスキップ

### 共通ルール
- ui/approval.htmlは変更しない（デザイン完成済み）
- .envのAPIキーはコードに直書きしない
- doc/10_active_rules.md > doc/03_knowledge.mdの優先順位を守る
- エラーが出ても自分で修正して再実行する

---

## 全部完了したらgit push

```bash
git add .
git commit -m "feat: working system — UI + poster + fetcher confirmed"
git push origin main
```

---

## Xアカウント情報（確定）

- アカウント名（表示名）：AIと余白
- ユーザー名：@S_creative_AI
- プロフィール文：
  広告制作の現場でAIを使い続けてる。
  うまく使えば、仕事に隙間ができる。
  その隙間の作り方を、現場目線で書いてます。
  プロンプト・ツール・ワークフロー / noteで詳しく。

---

## 追加設計（今回反映済み）

doc/10_active_rules.mdに以下を追加した：

1. SHORT型・THREAD型の判断基準
2. THREAD型の4投稿構成（フック→解決→証拠→誘導）
3. 週の投稿密度設計（Phase 2で実装）
4. 問いかけ投稿の設計（週1本・土曜）
5. ソース明示・tips具体化ルール
6. noteへの「一部だけ見せる」誘導設計

### ライターへの追加指示

writer.jsでSHORT型・THREAD型を判断して生成すること：
- SHORT型：通常通り1投稿を生成
- THREAD型：4投稿をセットで生成してキューに追加
- 土曜日は問いかけ投稿を1本生成する
