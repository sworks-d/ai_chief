# S-Project：AIエージェントSNS自動発信システム

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
| doc/03_knowledge.md | キャラクター・ターゲット・投稿の型（最重要） |
| doc/04_agents.md | 各エージェントの詳細仕様 |
| doc/05_ui.md | 承認UIの仕様 |
| doc/06_scene_map.md | 関係者・シーンマップ |

---

## 開発ルール

```
1. .envのAPIキーは絶対にコードに直書きしない
   → process.env.X_API_KEY のように環境変数から読む

2. 全エージェントのモデルはclaude-sonnet-4-6を使用
   → コスト管理のため。Opusは使わない

3. 全エージェントのログはdata/フォルダに記録
   → data/posts/・data/metrics/・data/personas/

4. エラーが出ても自分で修正して再実行する
   → 実装が完了するまで止まらない

5. 実装の順番
   → ①フォルダ構成作成 ②ナレッジファイル配置
   → ③エージェント実装 ④承認UI接続 ⑤cronスケジュール設定

6. テスト方法
   → 各エージェントはダミーデータで単体テストできる設計にする
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
