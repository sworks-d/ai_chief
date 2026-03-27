# Claude Codeへの現状引き継ぎ

まずdoc/フォルダの全ファイルを読んでください。
特にdoc/10_active_rules.md（最優先）を必ず読むこと。

読み終わったら以下の現状を把握して、続きを実装してください。

---

## 現在の動作状況

### 動作確認済み
- researcher.js：正常動作
- fact_checker.js：正常動作（軽微なパースエラーは自動スキップ）
- writer.js：正常動作（品質スコア7.8〜8.2・Sのキャラクターが出ている）

### 未対応
- poster.js：テスト未完了（理由は下記）
- fetcher.js：テスト未完了
- analyst.js：テスト未完了
- server.js（承認UI）：起動未確認
- モデル最適化：未適用
- プロンプトキャッシュ：未実装
- フィードバックループ：未実装

---

## poster.jsについて判明したこと

poster.jsのスロット設定が以下になっている：
- 7:00〜9:00   → Xのみ
- 12:00〜14:00 → Threadsのみ
- 21:00〜23:00 → X + Threads
- その他       → X + Threads

テストしたのが12:23だったため「Threadsのみ」のスロットになっていた。
Threadsの.envが未設定のため投稿できず、エラーに見えていたが正常動作。

対応してほしいこと：
1. poster.jsに「--force」フラグを追加して時間帯スロットを無視してテストできるようにする
2. Threads APIが未設定の場合はXだけ投稿してスキップする（エラーにしない）
3. fetcher.jsでメトリクス取得がFree Tier制限でエラーになった場合はログだけ残してスキップする

---

## X APIについて

現在のプラン：Free Tier
制限：
- 投稿（POST）：月1,500件 → 問題なし
- メトリクス取得（GET）：制限あり → エラーになった場合はスキップする設計にする

X Developer Portalが現在障害中のため確認できていないが、
投稿機能（poster.js）は動作するはず。

---

## 今回やってほしいこと（優先順位順）

### 1. server.jsを起動して承認UIの動作確認
- ui/approval.htmlが表示されること（デザイン変更不要・完成済み）
- writer.jsが生成した投稿データがQUEUEに表示されること
- OK/NGボタンが動作してキューに反映されること

### 2. poster.jsに--forceフラグを追加してXへの投稿テストを実施

### 3. 上記が動いたら以下を実装
- 各エージェントのモデルをdoc/07_model_cost.mdの設定に更新
  - researcher.js・fact_checker.js・poster.js・fetcher.js → claude-haiku-4-5-20251001
  - writer.js・analyst.js → claude-sonnet-4-6（変更なし）
- writer.jsとanalyst.jsにプロンプトキャッシュを実装（knowledge/フォルダが対象）
- analyst.jsに週次分析時にdoc/08_feedback_log.mdへ自動追記する機能を追加

### 4. 全部完了したらgit push

---

## 重要な注意事項

- ui/approval.htmlは変更しない（デザイン完成済み）
- .envのAPIキーはコードに直書きしない
- doc/10_active_rules.md > doc/03_knowledge.mdの優先順位を守る
- Threads APIは.envが空なのでスキップする設計にする
- エラーが出ても自分で修正して再実行する

---

## Xアカウント情報（確定）

- アカウント名（表示名）：AIと余白
- ユーザー名：@S_creative_AI
- プロフィール文：
  広告制作の現場でAIを使い続けてる。
  うまく使えば、仕事に隙間ができる。
  その隙間の作り方を、現場目線で書いてます。
  プロンプト・ツール・ワークフロー / noteで詳しく。
