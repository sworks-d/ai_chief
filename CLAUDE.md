# S-Project：AIエージェントSNS自動発信システム

## 最初に必ず読むこと

```
doc/00_s_philosophy.md を読んでから作業を始めること。
Sの思考・方向性・判断基準が全部書いてある。
読まずに提案すると「浅い」「違う」と言われる。
```


## プロジェクト概要

X（旧Twitter）とThreadsへの自動発信システム。
AIエージェント6体を使って情報収集→投稿生成→自動投稿→分析のサイクルを回す。
noteへの誘導でマネタイズする。

目標：月10〜20万円の自動収益

---

## 必ず最初に読むファイル

実装を始める前に以下のdocファイルを全て読むこと：

| ファイル | 内容 |
|---|---|
| doc/01_setup.md | 環境構築手順・フォルダ構成 |
| doc/02_system_design.md | システム全体設計・フロー |
| doc/03_knowledge.md | キャラクター・ターゲット・投稿の型（初期定義） |
| doc/04_agents.md | 各エージェントの詳細仕様 |
| doc/05_ui.md | 承認UIの仕様 |
| doc/06_scene_map.md | 関係者・シーンマップ |
| doc/07_model_cost.md | モデル割り振り・コスト最適化設計（必読） |
| doc/08_feedback_log.md | アナリストが自動追記するフィードバックログ |
| doc/09_tuning_history.md | Sが月1回更新するチューニング履歴 |
| doc/10_active_rules.md | 現在有効なルール最新版（最優先で参照） |
| doc/12_people_feedback.md | PEOPLEパネル・投稿FBループ設計（必読） |

---

## ルールの優先順位

```
doc/10_active_rules.md（最優先）
        ↓
doc/03_knowledge.md（初期定義・ベース）

10_active_rulesに記載がある項目は必ずそちらを優先する。
記載がない項目はdoc/03_knowledge.mdに従う。
```

---

## チューニングループ（コストゼロで継続改善）

```
毎日自動：エージェントが動いてデータを蓄積
        ↓
毎週自動：アナリストがdoc/08_feedback_log.mdに追記
        ↓
月1回・10分だけS：
  1. 承認UIの週次サマリーを読む
  2. doc/08_feedback_log.mdの提案を確認
  3. doc/10_active_rules.mdを更新（現在のルール）
  4. doc/09_tuning_history.mdに変更理由を記録
  5. GitHubにpush
        ↓
Claude Codeが次回からdoc/10_active_rules.mdを読んで動く
        ↓
精度が上がる → また蓄積 → ループ
```

エージェントとして立てない理由：
- mdファイルの更新はAPIコスト0で実現できる
- 人間（S）の判断を入れることで精度が上がる
- 自動で勝手にルールが変わると品質管理ができなくなる

---

## 開発ルール

```
1. .envのAPIキーは絶対にコードに直書きしない
   → process.env.X_API_KEY のように環境変数から読む

2. モデルはdoc/07_model_cost.mdの設定に従う
   → writer.jsとanalyst.jsはSonnet
   → それ以外はHaiku
   → Opusは使わない

3. 全エージェントのログはdata/フォルダに記録
   → data/posts/・data/metrics/・data/personas/

4. エラーが出ても自分で修正して再実行する
   → 実装が完了するまで止まらない

5. 実装の順番
   → ①フォルダ構成作成 ②ナレッジファイル配置
   → ③エージェント実装 ④承認UI接続 ⑤cronスケジュール設定

6. テスト方法
   → 各エージェントはダミーデータで単体テストできる設計にする

7. アナリストはdoc/08_feedback_log.mdへの自動追記を実装する
   → 毎週月曜の週次分析時にフォーマットに従って追記
```

---

## フォルダ構成

```
s-project/
├── doc/               ← 設計ドキュメント（このファイルも含む）
├── agents/            ← エージェントのJSファイル
├── knowledge/         ← ナレッジファイル（Markdown）
├── data/              ← 蓄積データ
│   ├── posts/
│   ├── metrics/
│   └── personas/
├── ui/                ← 承認UI
├── .env               ← APIキー（Gitに含めない）
├── .gitignore
├── CLAUDE.md          ← このファイル
└── package.json
```

---

## 技術スタック

```
ランタイム：Node.js 18+
パッケージ：
├── @anthropic-ai/sdk（Claude API）
├── axios（HTTP通信）
├── node-cron（スケジュール実行）
├── dotenv（環境変数管理）
└── express（承認UIのサーバー）

外部API：
├── X API v2（投稿・メトリクス取得）
└── Threads API（投稿・メトリクス取得）
```
