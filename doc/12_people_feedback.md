# 12 PEOPLEパネル・投稿フィードバックループ設計

## 設計思想

```
このシステムの投稿精度を上げる方法は2つある：

① 自分の投稿データから学ぶ（既存のフィードバックループ）
  → アナリストが週次分析でdoc/08_feedback_log.mdに追記
  → 自分の過去データが蓄積されるまで時間がかかる

② ジャンル内でバズってる人から学ぶ（今回追加）
  → 既にバズってる投稿のパターンをリアルタイムで分析
  → 初日から精度の高い投稿を生成できる
  → ①を補完・加速させる
```

---

## 2層構造のFBループ

### 層①：バズ投稿の構造分析 → writer.jsに直接反映（本質）

```
PEOPLEパネルで気になるアカウントを選ぶ
        ↓
「投稿を分析」ボタンをクリック
        ↓
X APIでそのアカウントの直近投稿を取得（最大20件）
        ↓
アナリストが以下を分析：
├── 1行目の構造パターン
├── 投稿の型（比較・正直・tips・問いかけ等）
├── 頻出キーワード・フレーズ
├── いいね数が多い投稿と少ない投稿の差
└── Sのジャンルに置き換えた投稿例を1本生成
        ↓
「この分析を反映する」でdata/people_insights.jsonに保存
        ↓
writer.jsが次回から「今バズってる型」として参照
```

### 層②：「誰に刺さってるか」の把握 → ターゲット精度向上（補強）

```
ENGAGEタブで「絡んだ」ボタンをクリック
        ↓
絡んだアカウントのプロフィール・投稿傾向をログ
        ↓
週次分析でアナリストが「どのタイプの人に絡むと
フォロワーが増えるか」の仮説を生成
        ↓
doc/08_feedback_log.mdに追記
        ↓
ターゲット人物像（doc/10_active_rules.md）が精度向上
```

---

## PEOPLEパネルの構成

### 3タブ構成

```
WATCH（追う）：
定義：ターゲット読者と読者層が被ってる影響力アカウント
目的：情報源・バズ分析の対象として継続的に観察する
更新：毎週月曜にアナリストが更新

ENGAGE（今絡む）：
定義：直近48h以内にバズった投稿を出したアカウント
目的：今日中にリプライ・いいねして認知を取る
更新：6時間ごとにresearcher.jsが自動更新

SIMILAR（競合分析）：
定義：同ジャンルで発信してる競合アカウント
目的：差別化ポイントを把握する・真似ではなく参考
更新：毎週月曜にアナリストが更新
```

### 各カードの情報

```
表示する情報：
├── アカウント名・@ハンドル
├── フォロワー数
├── 直近バズ投稿1本（本文・いいね数）
├── 読者重複度（HIGH/MID/LOW）
├── 投稿頻度（毎日/週3/週1等）
└── アナリストの一言コメント

操作ボタン：
├── 「フォロー済」トグル（localStorageで保存）
├── 「絡んだ」ボタン（ログに記録）
└── 「投稿を分析」ボタン（層①のFBを実行）
```

---

## 「投稿を分析」の詳細仕様

### 取得する投稿データ

```
X API：GET /2/users/:id/tweets
パラメータ：
├── max_results: 20
├── tweet.fields: public_metrics,created_at,text
└── exclude: retweets,replies（自分の投稿のみ）

取得データ：
├── 投稿本文
├── いいね数・リポスト数・リプライ数・保存数
└── 投稿日時

バズ判定：
├── いいね100以上 → バズ
└── いいね30〜99 → プチバズ
```

### アナリストへの分析依頼プロンプト

```
以下の{account}の投稿{N}件を分析してください。

目的：
自分のアカウント（AI×クリエイティブ・制作現場目線）の
投稿生成に活用するための知見を抽出する。

分析してほしいこと：
① 1行目の構造パターン
   - 疑問形・数字・体験談・断言・カウンターのどれか
   - いいねが多い投稿の1行目の共通点

② 投稿の型の傾向
   - 比較・ジャッジ / 正直に言う / tips・手順 / 問いかけ / 体験談
   - いいねが多い投稿はどの型が多いか

③ 頻出キーワード・フレーズ
   - 特徴的な言い回し・語尾・間の取り方
   - ターゲット読者の「痛み・欲求」を刺してる言葉

④ いいねが多い投稿と少ない投稿の差
   - 何が違うのか（テーマ・長さ・締め方等）

⑤ Sのジャンルに置き換えた投稿例を1本生成
   - ジャンル：AI×クリエイティブ・広告制作現場
   - キャラクター：30代CD・一人称「僕」・現場目線
   - 分析したバズパターンを適用して生成する

JSON形式で返してください：
{
  "account": "@handle",
  "post_count": N,
  "pattern_1st_line": "1行目の構造パターンの説明",
  "top_types": ["型名1", "型名2"],
  "keywords": ["言葉1", "言葉2", "言葉3"],
  "buzz_vs_not": "差の説明",
  "sample_post": "生成した投稿例",
  "summary": "一言でこのアカウントのバズる理由"
}
```

### data/people_insights.jsonのフォーマット

```json
{
  "updated_at": "2026-03-27T10:00:00Z",
  "insights": [
    {
      "account": "@handle",
      "analyzed_at": "2026-03-27T10:00:00Z",
      "follower_count": 34200,
      "tab": "WATCH",
      "summary": "疑問形 + 現場の本音 + カウンター構造が一番刺さってる",
      "pattern_1st_line": "疑問形が多い・「〜って知ってた？」「〜って感じたことない？」",
      "top_types": ["型③正直に言う", "型①気づいた"],
      "keywords": ["現場", "クライアント", "変わった", "気がする"],
      "buzz_vs_not": "長い投稿より短い投稿の方がいいねが多い。カウンター（笑）がある投稿が特に伸びてる",
      "sample_post": "Sのジャンルで生成した投稿例テキスト"
    }
  ]
}
```

---

## writer.jsへの反映方法

```javascript
// writer.jsの投稿生成時に以下を追加

// data/people_insights.jsonが存在する場合
// システムプロンプトに以下を追記：

const peopleInsights = loadPeopleInsights(); // 最新5件まで

if (peopleInsights.length > 0) {
  systemPrompt += `

【今ジャンル内でバズってる投稿パターン】
以下は直近のリサーチで判明したバズパターンです。
生成する投稿に積極的に取り入れてください：

${peopleInsights.map(i => `
アカウント：${i.account}
バズる理由：${i.summary}
よく使う型：${i.top_types.join('・')}
頻出ワード：${i.keywords.join('・')}
参考投稿例：${i.sample_post}
`).join('\n---\n')}
`;
}
```

---

## researcher.jsへの追加（ENGAGEタブの自動更新）

```
6時間ごとにX APIで以下を検索：

キーワード：
├── 生成AI（日本語）
├── AIデザイン・AIクリエイター・AI制作
├── Midjourney・Runway・Firefly・Claude
└── WEB制作AI・映像AI・広告AI

フィルター：
├── 直近48時間以内
├── いいね30以上
├── 日本語優先（lang:ja）
└── リツイート除外

取得した投稿の投稿者を：
├── フォロワー数が多い → WATCHリストに追加候補
├── バズ中の投稿 → ENGAGEリストに追加
└── 同ジャンルで継続発信 → SIMILARリストに追加候補

結果をdata/people_cache.jsonに保存
アナリストが週次分析でWATCH/SIMILARリストを更新
```

---

## APIの残量表示（コストゼロ）

```
表示場所：承認UIのヘッダー右側に小さく表示

Anthropic API残高：
→ /api/statusエンドポイントで取得
→ ANTHROPIC_API_KEYを使って残高を確認
→ コストゼロ（残高確認APIはトークンを消費しない）

X API残量：
→ poster.js・fetcher.jsがAPIを叩くたびに
  レスポンスヘッダーのx-rate-limit-remainingを記録
→ data/api_status.jsonに保存
→ /api/statusが読んで返す
→ 追加コストゼロ

表示例：
「Anthropic $8.42 | X 1,347/1,500」

警告表示：
├── Anthropic残高 $3以下 → amber色で表示
├── X残量 300以下 → amber色で表示
└── どちらかが0 → red色でアラート
```

---

## 全体のデータフロー

```
researcher.js（6h）
└── X APIでバズ投稿検索
└── data/people_cache.jsonに保存
        ↓
analyst.js（週次）
└── people_cacheを分析
└── WATCH/ENGAGE/SIMILARリストを更新
└── doc/08_feedback_log.mdに追記
        ↓
Sがブラウザで「投稿を分析」をクリック
└── analyst.jsがバズ投稿を詳細分析
└── data/people_insights.jsonに保存
        ↓
writer.js（毎朝6:45）
└── people_insights.jsonを参照
└── 「今バズってる型」を投稿生成に反映
        ↓
投稿の精度が上がる → また反応データが蓄積 → ループ
```

---

## 実装の優先順位

```
Phase 1（今すぐ）：
├── PEOPLEパネルのUI実装（WATCH/ENGAGE/SIMILARタブ）
├── data/people_cache.jsonの手動入力で初期データを作る
└── 「フォロー済」トグル・「絡んだ」ボタンの実装

Phase 2（動き始めてから）：
├── researcher.jsにX APIバズ検索を追加
├── 「投稿を分析」ボタンの実装
└── data/people_insights.jsonのwriter.jsへの反映

Phase 3（フォロワー500人以降）：
├── 「絡んだ」ログとフォロワー増加の相関分析
└── 「どのタイプに絡むと効果的か」の自動提案
```

---

## Claude Codeへの実装指示

```
doc/12_people_feedback.mdを読んでください。
以下の優先順位で実装してください：

【Phase 1】
1. ui/approval.htmlにPEOPLEパネルを追加する
   - 4つ目のパネルとして追加（PC：4カラム、スマホ：底部ナビにPEOPLEタブ追加）
   - WATCH/ENGAGE/SIMILARの3タブ構成
   - 各カードに「フォロー済」トグル・「絡んだ」ボタン

2. server.jsに /api/people エンドポイントを追加する
   - GET /api/people → data/people_cache.jsonを返す
   - POST /api/people/engaged → 絡んだログを記録

3. data/people_cache.jsonを初期データとして作成する
   - AI×クリエイティブジャンルで影響力があるアカウントを5件
   - WATCHに3件・SIMILARに2件

4. ヘッダーにAPI残量を表示する
   - GET /api/status エンドポイントを追加
   - Anthropic残高・X API残量を表示

デザインは既存のCSSを踏襲すること。
完了したらgit pushしてください。
```
