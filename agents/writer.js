/**
 * エージェント3：ライター
 * 役割：ファクトチェッカーから渡された情報を「Sが書いたような投稿」に変換する
 * 実行タイミング：6:45自動起動
 * doc/10_active_rules.md準拠
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TODAY = new Date().toISOString().split('T')[0];
const DAY_OF_WEEK = new Date().getDay(); // 0=日, 6=土
const INPUT_DIR = path.join(__dirname, '..', 'data', 'checked');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'queue');
const INPUT_FILE = path.join(INPUT_DIR, `${TODAY}.json`);
const OUTPUT_FILE = path.join(OUTPUT_DIR, `${TODAY}.json`);

// ナレッジファイル読み込み
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');
const character = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'character.md'), 'utf-8');
const target = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'target.md'), 'utf-8');
const postTypes = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'post_types.md'), 'utf-8');
const sceneMap = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'scene_map.md'), 'utf-8');
const ngWords = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'ng_words.md'), 'utf-8');

/**
 * people_insights.jsonから最新5件のバズパターンを読み込む（A-8）
 */
function loadPeopleInsightsSection() {
  const insightsFile = path.join(__dirname, '..', 'data', 'people_insights.json');
  if (!fs.existsSync(insightsFile)) return '';
  try {
    const insights = JSON.parse(fs.readFileSync(insightsFile, 'utf-8'));
    const latest5 = (insights.insights || []).slice(-5);
    if (latest5.length === 0) return '';
    const lines = latest5.map(i =>
      `- ${i.account}: バズ型「${i.buzz_pattern || '—'}」 頻出型[${(i.top_types || []).join('/')}] 頻出語[${(i.keywords || []).slice(0, 3).join(',')}]`
    ).join('\n');
    return `\n\n=== 今バズってる型・キーワード（参考）===\n${lines}`;
  } catch {
    return '';
  }
}

/**
 * キャッシュ対象の安定したシステムコンテンツを構築（A-2）
 */
function buildSystemContent() {
  const peopleSection = loadPeopleInsightsSection();
  return `=== キャラクター定義 ===
${character}

=== ターゲット定義 ===
${target}

=== 投稿の型 ===
${postTypes}

=== シーンマップ ===
${sceneMap}

=== NGワード・禁止表現 ===
${ngWords}

=== 追加禁止表現（絶対使わない）===
「絶対」「必ず」「間違いなく」「〜ということです」「〜を覚えておいてください」「現場的には」「参考になれば幸いです」
実クライアント名・案件の具体情報は一切書かない。医療・法律・投資の断言もしない。${peopleSection}`;
}

/**
 * X APIの重み付き文字数を計算（日本語=2文字扱い）
 */
function xWeightedLength(text) {
  let count = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    count += (code > 0x7f) ? 2 : 1;
  }
  return count;
}

/**
 * 投稿フォーマット（SHORT / THREAD）を判断
 * doc/10_active_rules.md準拠
 */
function determineFormat(item) {
  const { info_type, theme_tag, post_hint = '' } = item;
  // 手順が3ステップ以上 / ソース+現場応用が両方必要 / プロンプト見せたい → THREAD
  const threadKeywords = ['プロンプト', '手順', 'ステップ', 'やり方', 'フロー', '3つ', '4つ', '5つ'];
  const hintHasThread = threadKeywords.some(kw => post_hint.includes(kw));
  if (hintHasThread || info_type === 'TYPE_A' && (theme_tag === 'tips' || theme_tag === 'ツール') && post_hint.length > 80) {
    return 'THREAD';
  }
  return 'SHORT';
}

/**
 * 今日が土曜日か判定
 */
function isSaturday() {
  return DAY_OF_WEEK === 6;
}

/**
 * 型の優先順位に従ってpostTypeを選択
 * doc/10_active_rules.md: 型⑤⑥⑦最優先
 */
function selectPostType(infoType, themeTag) {
  // tips・ツール系は型⑤⑥⑦優先
  if (themeTag === 'tips' || themeTag === 'マネタイズ') return '型⑤';
  if (themeTag === 'ツール') return '型⑦';
  if (themeTag === '比較') return '型⑥';

  const typeMap = {
    TYPE_A: ['型⑦', '型⑤', '型①'],
    TYPE_B: ['型⑥', '型②'],
    TYPE_C: ['型③'],
    TYPE_D: ['型④'],
  };
  const candidates = typeMap[infoType] || ['型①'];
  return candidates[0];
}

/**
 * SHORT型：1投稿を生成
 */
async function generateShortPost(item, platform, attempt = 1) {
  const postType = selectPostType(item.info_type, item.theme_tag);
  // X: 日本語は2文字カウントのため実質140文字以内に制限
  const charNote = platform === 'X' ? '（日本語140文字以内・X重み付き280文字以内）' : '（500文字以内）';

  // 曜日別推奨型（A-4: 週の投稿密度）
  const dayGuide = ['','月：問題提起系','火：tips系（手順）','水：THREAD推奨','木：比較・ジャッジ系','金：本音系','土：問いかけ',''][DAY_OF_WEEK];

  const userPrompt = `あなたはShotaro（S）の代筆エージェントです。上記のナレッジを完全に理解した上で投稿を生成してください。

## アクティブルール（最優先）

### 型の優先順位
型⑤（プロンプト術・再現できる系）：最優先
型⑥（比較・ジャッジ系）：優先
型⑦（活用術・ハウツー系）：優先

### 1行目のルール
優先：体験から入る「〜してみたんだけど」/ 疑問形 / 数字・具体的な変化
禁止：「〜です。」で始まる説明口調 / 「みなさん」「皆さん」の呼びかけ / 「今日は〜について」の宣言型

### 締め方のルール
優先：シーンが浮かぶ行動（「次の提案、これで突撃してみます。笑」）/ 問いかけ / 独り言
禁止：断言で終わる（「〜です。」のみ） / 「参考になれば幸いです」系

### カウンター構造
全投稿の70%以上にカウンターを入れる（強い言葉の後に「笑」「知らんけど」「たぶん」等）

### ソース明示
公式発表・数字が出る場合は「〜が発表」と明記
自分の体験の場合は「実際にやってみたら」と明記
未確認の場合は「まだ確認中だけど」と明記

### tipsの具体化
手順は番号付き（1・2・3）で書く
結果は具体的な変化で書く（「効率が上がった」ではなく「修正が3回→0回になった」）
再現できる情報（プロンプト・ツール・手順）を1つ以上入れる

### 週の推奨タイプ（今日）
${dayGuide}

---

## 生成する投稿の情報

プラットフォーム：${platform}${charNote}
情報タイプ：${item.info_type}
使う型：${postType}
テーマ：${item.theme_tag}
レイヤー：${item.layer}
${attempt === 2 ? '※前回の生成では文字数超過か品質不足でした。より簡潔に、Sらしさを優先して再生成してください。' : ''}

元情報：
タイトル：${item.title}
要約：${item.summary_ja}
ソース：${item.source_name}
投稿ヒント：${item.post_hint || 'なし'}
${item.type_b_hint ? `B型ヒント：${item.type_b_hint.hint}` : ''}

## 出力形式

以下のJSONのみ出力してください：
{
  "post_text": "投稿本文${charNote}・改行は\\nで表現",
  "post_type": "${postType}",
  "character_tag": "登場した関係者（なければnull）",
  "layer1": "事実・根拠の要約（1行）",
  "layer2": "Sの現場解釈（1行）",
  "layer3": "読者への有益性（1行）",
  "quality_score": 0.0,
  "quality_notes": "品質に関するメモ"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: [
      { type: 'text', text: buildSystemContent(), cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    // 文字数オーバーチェック（X: 重み付きカウント）
    if (parsed && parsed.post_text) {
      const len = platform === 'X' ? xWeightedLength(parsed.post_text) : parsed.post_text.length;
      const limit = platform === 'X' ? 280 : 500;
      if (len > limit) {
        console.warn(`[Writer] 文字数オーバー: 重み付き${len} > ${limit} (${platform})`);
        return null;
      }
    }

    return parsed;
  } catch (e) {
    console.error('[Writer] parse error:', e.message);
    return null;
  }
}

/**
 * THREAD型：4投稿セットを生成（X専用）
 * 構成：フック→解決策→証拠→誘導
 */
async function generateThreadPosts(item) {
  const postType = selectPostType(item.info_type, item.theme_tag);

  const userPrompt = `あなたはShotaro（S）の代筆エージェントです。上記のナレッジを完全に理解した上で、Xのスレッド投稿を生成してください。

## アクティブルール（最優先）

### 1行目のルール
優先：体験から入る「〜してみたんだけど」/ 疑問形 / 数字・具体的な変化
禁止：「〜です。」で始まる説明口調 / 「みなさん」呼びかけ

### tipsの具体化
手順は番号付き（1・2・3）で書く
結果は具体的な変化で書く（「修正が3回→0回」レベルの数字）
再現できる情報を1つ以上入れる

---

## THREAD型の構成（4投稿セット）

投稿1（フック）：問題提起 + 結論だけ。「気になる人はリプ欄へ」
投稿2（手順）：具体的な手順（番号付き）
投稿3（証拠）：実際の結果・数字・プロンプトの一部だけ見せる（全部見せない）
投稿4（本音）：Sの本音（カウンター）。カジュアルに締める。外部URLへの誘導は入れない。

各投稿：日本語140文字以内（X重み付き280文字以内）

---

## 生成する投稿の情報

情報タイプ：${item.info_type}
使う型：${postType}
テーマ：${item.theme_tag}

元情報：
タイトル：${item.title}
要約：${item.summary_ja}
ソース：${item.source_name}
投稿ヒント：${item.post_hint || 'なし'}

## 出力形式

以下のJSONのみ出力してください：
{
  "thread_posts": [
    {
      "thread_index": 1,
      "thread_role": "フック",
      "post_text": "投稿1本文（140文字以内）"
    },
    {
      "thread_index": 2,
      "thread_role": "手順",
      "post_text": "投稿2本文（140文字以内）"
    },
    {
      "thread_index": 3,
      "thread_role": "証拠",
      "post_text": "投稿3本文（140文字以内）"
    },
    {
      "thread_index": 4,
      "thread_role": "本音",
      "post_text": "投稿4本文（140文字以内）"
    }
  ],
  "post_type": "${postType}",
  "character_tag": "登場した関係者（なければnull）",
  "layer1": "事実・根拠の要約（1行）",
  "layer2": "Sの現場解釈（1行）",
  "layer3": "読者への有益性（1行）",
  "quality_score": 0.0,
  "quality_notes": "品質に関するメモ"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [
      { type: 'text', text: buildSystemContent(), cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed?.thread_posts?.length) return null;

    // 各投稿の文字数チェック
    for (const post of parsed.thread_posts) {
      const len = xWeightedLength(post.post_text);
      if (len > 280) {
        console.warn(`[Writer] スレッド投稿${post.thread_index}が文字数超過: ${len} > 280`);
        post.post_text = post.post_text.slice(0, 130); // 強制トリム
      }
    }

    return parsed;
  } catch (e) {
    console.error('[Writer] thread parse error:', e.message);
    return null;
  }
}

/**
 * 土曜の問いかけ投稿を生成（X専用）
 */
async function generateQuestionPost() {
  const userPrompt = `あなたはShotaro（S）の代筆エージェントです。
上記のナレッジを参照して、フォロワーへの「問いかけ投稿」を生成してください。

## 問いかけ投稿の設計

目的：リプライの内容でターゲット層を分析する（ペルソナ更新の装置）

構成：
「①②③どれ？」という選択肢を出して、フォロワーに答えさせる

例：
「代理店のソルジャーに無茶振りされた時、AIをどう使うかまだ答えが出てない。

①AIに全部任せる
②たたき台だけAI・仕上げは自分
③そもそもAI使わない

みんなどれ？」

条件：
- 日本語140文字以内（X重み付き280文字以内）
- AIと仕事・クリエイティブに関するテーマ
- 選択肢は3〜4個
- Sらしいカジュアルな口調

## 出力形式

以下のJSONのみ出力してください：
{
  "post_text": "問いかけ投稿本文（140文字以内）",
  "post_type": "問いかけ",
  "character_tag": null,
  "layer1": "問いかけのテーマ",
  "layer2": "ターゲット分析の意図",
  "layer3": "フォロワーのエンゲージメント促進",
  "quality_score": 7.5,
  "quality_notes": "土曜問いかけ投稿"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: [
      { type: 'text', text: buildSystemContent(), cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (parsed?.post_text) {
      const len = xWeightedLength(parsed.post_text);
      if (len > 280) {
        console.warn(`[Writer] 問いかけ投稿文字数超過: ${len} > 280`);
        return null;
      }
    }
    return parsed;
  } catch (e) {
    console.error('[Writer] question parse error:', e.message);
    return null;
  }
}

/**
 * 単一情報からX・Threadsの投稿セットを生成
 */
async function generatePostSet(item) {
  const results = [];
  const format = determineFormat(item);
  console.log(`[Writer]   フォーマット: ${format}`);

  // source_url付与条件
  const qualifiedSourceTypes = ['公式', '業界メディア'];
  const hasSourceUrl = item.source_url && qualifiedSourceTypes.includes(item.source_type);

  if (format === 'THREAD') {
    // THREAD型：4投稿セット（X専用）
    const threadResult = await generateThreadPosts(item);
    if (threadResult && threadResult.quality_score >= 7.0) {
      const threadGroupId = `${TODAY}-TH-GROUP-${Date.now()}`;
      for (const tp of threadResult.thread_posts) {
        results.push({
          post_text: tp.post_text,
          post_type: threadResult.post_type,
          character_tag: threadResult.character_tag,
          layer1: threadResult.layer1,
          layer2: threadResult.layer2,
          layer3: threadResult.layer3,
          quality_score: threadResult.quality_score,
          quality_notes: threadResult.quality_notes,
          thread_group: threadGroupId,
          thread_index: tp.thread_index,
          thread_role: tp.thread_role,
          id: `${TODAY}-X-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          platform: 'X',
          source_item: item,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      }
      // フック（index=1）のみsource_urlを付与
      if (hasSourceUrl) {
        const hookPost = results.find(r => r.thread_index === 1);
        if (hookPost) {
          hookPost.post_text = hookPost.post_text + '\n' + item.source_url;
          hookPost.source_url = item.source_url;
        }
      }
    } else {
      console.log('[Writer]   THREAD型品質不足 → SHORT型にフォールバック');
      // フォールバック: SHORT型で生成
      const xPost = await generateShortPost(item, 'X');
      if (xPost && xPost.quality_score >= 7.0) {
        results.push({
          ...xPost,
          id: `${TODAY}-X-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          platform: 'X', source_item: item, status: 'pending',
          created_at: new Date().toISOString(),
        });
      }
    }
  } else {
    // SHORT型：X投稿（最大2回、品質スコア7.0以上）
    for (let attempt = 1; attempt <= 2; attempt++) {
      const xPost = await generateShortPost(item, 'X', attempt);
      if (xPost && xPost.quality_score >= 7.0) {
        const postObj = {
          ...xPost,
          id: `${TODAY}-X-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          platform: 'X', source_item: item, status: 'pending',
          created_at: new Date().toISOString(),
        };
        // source_url付与
        if (hasSourceUrl) {
          postObj.post_text = postObj.post_text + '\n' + item.source_url;
          postObj.source_url = item.source_url;
        }
        results.push(postObj);
        break;
      }
      // 2回でも7.0未満 → 捨てる（doc/10_active_rules.md準拠）
      if (attempt === 2) {
        console.log(`[Writer]   X品質不足 (2回試行) → スキップ`);
      }
    }
  }

  // Threads投稿（SHORT型のみ・最大2回）
  // THREADS_ACCESS_TOKENが設定されている場合のみ生成
  if (process.env.THREADS_ACCESS_TOKEN) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const threadsPost = await generateShortPost(item, 'Threads', attempt);
      if (threadsPost && threadsPost.quality_score >= 7.0) {
        results.push({
          ...threadsPost,
          id: `${TODAY}-TH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          platform: 'Threads', source_item: item, status: 'pending',
          created_at: new Date().toISOString(),
        });
        break;
      }
      if (attempt === 2) {
        console.log(`[Writer]   Threads品質不足 (2回試行) → スキップ`);
      }
    }
  } else {
    console.log(`[Writer]   Threads未設定のためスキップ`);
  }

  return results;
}

/**
 * メイン処理
 */
async function main(testMode = false) {
  console.log(`[Writer] 起動 - ${TODAY} (${['日','月','火','水','木','金','土'][DAY_OF_WEEK]}曜日)`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ファクトチェッカー出力を読み込み
  let items = [];
  if (testMode) {
    const { main: checkMain } = require('./fact_checker');
    items = await checkMain(true);
  } else {
    if (!fs.existsSync(INPUT_FILE)) {
      console.error(`[Writer] 入力ファイルが見つかりません: ${INPUT_FILE}`);
      process.exit(1);
    }
    items = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  }

  const targetItems = items.filter(i => i.info_type !== 'NG').slice(0, 8);
  console.log(`[Writer] ${targetItems.length}件から投稿を生成中...`);

  const allPosts = [];

  // 土曜日：問いかけ投稿を最初に1本生成
  if (isSaturday()) {
    console.log('[Writer] 土曜日：問いかけ投稿を生成...');
    const qPost = await generateQuestionPost();
    if (qPost) {
      allPosts.push({
        ...qPost,
        id: `${TODAY}-X-${Date.now()}-question`,
        platform: 'X', source_item: null, status: 'pending',
        created_at: new Date().toISOString(),
      });
      console.log('[Writer]   問いかけ投稿生成完了');
    }
  }

  for (const item of targetItems) {
    console.log(`[Writer] 生成中: ${item.title}`);
    const posts = await generatePostSet(item);
    allPosts.push(...posts);
  }

  // 品質スコア順にソート
  allPosts.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

  // X：上位5本（8件生成からTOP5）、Threads：上位3本（6件生成からTOP3）
  const xPosts = allPosts.filter(p => p.platform === 'X').slice(0, 5);
  const threadsPosts = allPosts.filter(p => p.platform === 'Threads').slice(0, 3);
  const queue = [...xPosts, ...threadsPosts];

  // 既存のキューと統合（approved/posted/rejectedは保持）
  let existing = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try { existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8')); } catch {}
  }
  const preserved = existing.filter(p => ['approved', 'posted', 'rejected'].includes(p.status));
  const merged = [...preserved, ...queue];

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));
  console.log(`[Writer] 完了 - X:${xPosts.length}本 / Threads:${threadsPosts.length}本 → ${OUTPUT_FILE}`);

  return queue;
}

if (require.main === module) {
  const testMode = process.argv.includes('--test');
  main(testMode).catch(console.error);
}

module.exports = { main, generateShortPost, generatePostSet };
