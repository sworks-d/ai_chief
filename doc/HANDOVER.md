# HANDOVER — 現在の実装状況

最終更新：2026-03-27

---

## 動作確認済みのエージェント

| エージェント | 状態 | テスト方法 |
|---|---|---|
| researcher.js | ✅ 動作確認済み | `node agents/researcher.js --test` |
| fact_checker.js | ✅ 動作確認済み | `node agents/fact_checker.js --test` |
| writer.js | ✅ 動作確認済み | `node agents/writer.js`（SHORT/THREAD自動判断） |
| poster.js | ✅ 動作確認済み | `node agents/poster.js --force` |
| fetcher.js | ✅ 動作確認済み | `node agents/fetcher.js --test` |
| analyst.js | ✅ 動作確認済み | `node agents/analyst.js --force` |

---

## 実装済みの主要機能

### エージェント
- **プロンプトキャッシュ** (A-2): writer.js, analyst.js にcache_control追加済み
- **SHORT/THREAD自動判断** (A-3): writer.js の determineFormat() で実装済み
- **全ルール反映** (A-4): noteへの誘導・週の投稿密度・禁止ワード全リスト追加済み
- **feedback_log自動追記** (A-5): analyst.js 週次分析後に doc/08_feedback_log.md へ追記
- **XバズAI収集** (A-6): researcher.js の searchXBuzz() で実装済み（Free Tier制限時スキップ）
- **日別保存** (A-7): data/research/YYYY-MM-DD.json に保存
- **people_insights連携** (A-8): 全エージェントでdata/people_cache.jsonを参照
- **PEOPLEパネル** (A-8b): UIに4番目のパネルとして実装。「投稿を分析」ボタン、「全エージェントに反映」ボタン
- **Threads未設定時スキップ** (A-10): poster.js, writer.js で実装済み
- **--forceフラグ** (E-1対応): analyst.js に --force フラグ追加

### UI
- **INPUTパネル**: 日付ナビ、注目/すべてセクション、🔖ブックマーク
- **QUEUEパネル**: 未承認/承認済みタブ、編集・削除・今すぐ投稿
- **DATAパネル**: 昨日の数字、MVP投稿、HISTORY
- **PEOPLEパネル**: WATCH/ENGAGE/SIMILARタブ、「投稿を分析」ボタン
- **ヘッダー**: Anthropic残高・X API残量表示（/api/status から取得）
- **マニュアルページ**: /manual で開く（「← ダッシュボードに戻る」リンクあり）

### インフラ
- **cronスケジュール**: index.js に設定済み（05:00〜21:00）
- **data/logs/**: fetcher.jsのエラーログ保存先 (fetcher-error.json)
- **data/people_cache.json**: WATCHリスト初期データ入り
- **data/people_insights.json**: 分析後に自動生成

---

## 既知の制限・未完了事項

| 項目 | 状況 | 対応 |
|---|---|---|
| X API Free Tier | メトリクス取得が402/403でスキップされる | 有料プランへの移行で解決 |
| Anthropic残高API | 残高取得APIが存在しない → 常にnull | 手動で確認するか省略 |
| X API残量 | api_status.jsonが存在しない間は常にnull | poster.js投稿後に自動記録される |
| E-4 X実投稿テスト | 未実行（Sが確認・承認後に実施） | `node agents/poster.js --force` |
| people_insights分析 | Free Tier制限でX APIからのツイート取得スキップ → 空で分析 | 有料X APIで解決 |

---

## 次にやること（優先順）

1. **X実投稿テスト** (E-4): `node agents/poster.js --force` でQUEUEの承認済み投稿を実際にXに投稿
2. **本番cronの動作確認**: 翌朝5:00以降に自動起動することを確認
3. **メトリクス蓄積**: Free Tier制限が解除されたらfetcher.jsでメトリクス取得開始
4. **doc/10_active_rules.mdのチューニング**: 1週間後にアナリストのフィードバックを基に更新

---

## 起動方法

```bash
# 本番起動（cron + UI）
npm start

# 承認UIのみ
npm run ui

# 外部アクセス
npm run tunnel
```

アクセス: http://localhost:3001
