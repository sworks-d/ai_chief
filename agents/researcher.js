/**
 * エージェント1：リサーチャー
 * 役割：広く・速く・多くAI関連情報を収集する
 * 実行タイミング：MICRO毎朝5:00 / MIDDLE月水金深夜 / MACRO日曜深夜
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TODAY = new Date().toISOString().split('T')[0];
const DATA_DIR = path.join(__dirname, '..', 'data', 'research');
const OUTPUT_FILE = path.join(DATA_DIR, `${TODAY}.json`);

/**
 * people_cache.jsonのWATCHリストを読み込む
 */
function loadWatchAccounts() {
  const cacheFile = path.join(__dirname, '..', 'data', 'people_cache.json');
  if (fs.existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return (cache.watch || []).map(w => ({ account: w.account, name: w.name, description: w.description }));
    } catch {}
  }
  return [];
}

// ソース定義（実際のWebスクレイピング代わりにClaudeが最新情報を生成）
const SOURCES = {
  MICRO: {
    themes: [
      'AIツールの使い方・裏技・プロンプト術（Midjourney・Runway・Firefly・Claude・ChatGPT）',
      'AIを使ったマネタイズ・副業・稼ぎ方の具体事例',
      '今バズってるAI関連コンテンツ（X・YouTube・note直近24h）',
    ],
    sources: ['X（#aiart #midjourney #生成AI #AIデザイン）', 'YouTube AI急上昇', 'note・Zenn国内記事', 'ProductHunt新ツール'],
    limit: 30,
  },
  MIDDLE: {
    themes: [
      '新AIツールリリース・大型アップデート情報',
      '広告・映像・制作会社のAI導入事例・企業DX事例',
      'クライアントワークでのAI使用範囲・開示義務',
    ],
    sources: ['Midjourney・Runway・Firefly公式Blog', '宣伝会議・AdAge・DIGIDAY', '各企業プレスリリース'],
    limit: 15,
  },
  MACRO: {
    themes: [
      'AIとクリエイティブ産業の構造変化・未来予測',
      'AIと著作権・法律の最新動向（EU AI Act・文化庁ガイドライン）',
    ],
    sources: ['McKinsey・Gartner・Wired・MIT Technology Review', '文化庁・特許庁・経産省'],
    limit: 5,
  },
};

/**
 * 指定レイヤーの情報収集をClaudeに依頼する
 */
async function researchLayer(layer) {
  const config = SOURCES[layer];
  const watchAccounts = loadWatchAccounts();
  const watchSection = watchAccounts.length > 0
    ? `\n優先監視アカウント（これらのアカウントが最近取り上げたトピックを優先的に含める）：\n${watchAccounts.map(w => `${w.account}（${w.name}）`).join('、')}\n`
    : '';

  const prompt = `あなたはAIとクリエイティブ業界の情報収集エージェントです。
今日（${TODAY}）時点での最新情報を収集してください。
${watchSection}
収集テーマ：
${config.themes.map((t, i) => `${i + 1}. ${t}`).join('\n')}

参考ソース：
${config.sources.join('、')}

以下の条件で${Math.min(config.limit, 10)}件の情報をJSONで出力してください：
- 日本のクリエイター（デザイナー・映像・CD等）に最も関連する情報
- 鮮度が高い（できるだけ最近の）情報
- ファクトとして伝えられる情報（憶測ではなく）

各情報は以下のJSON形式で出力（配列）：
{
  "title": "タイトル（日本語30字以内）",
  "source_url": "https://... (推測でもOK、または空文字)",
  "source_name": "媒体名",
  "layer": "${layer}",
  "theme_tag": "著作権 | 企業事例 | ツール | クライアントワーク | tips | マネタイズ | バズ",
  "collected_at": "${new Date().toISOString()}",
  "first_published": "YYYY-MM-DD または null",
  "summary_ja": "日本語要約（3行以内）",
  "source_type": "公式 | 業界メディア | コミュニティ | SNS | 法律",
  "japan_circulation": "未流通 | 一部流通 | バズ済み | 不明"
}

JSONの配列のみ出力してください。余計な説明は不要です。`;

  const stream = await client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const response = await stream.finalMessage();
  const text = response.content.find(b => b.type === 'text')?.text || '[]';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (e) {
    console.error(`[Researcher] ${layer} JSON parse error:`, e.message);
    return [];
  }
}

/**
 * XのバズAI投稿を収集（Free Tier対応・エラー時スキップ）
 */
async function searchXBuzz() {
  if (!process.env.X_API_KEY || !process.env.X_ACCESS_TOKEN) {
    console.log('[Researcher] X検索スキップ（APIキー未設定）');
    return [];
  }
  try {
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    // 日本語 + AI関連キーワード、直近24h
    const query = '(AI OR ChatGPT OR Claude OR Midjourney OR 生成AI OR AIデザイン OR AIクリエイター) -is:retweet lang:ja';
    const result = await client.v2.search(query, {
      max_results: 20,
      'tweet.fields': ['public_metrics', 'created_at', 'author_id'],
      expansions: ['author_id'],
      'user.fields': ['username'],
      start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });

    const users = result.includes?.users || [];
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u.username; });

    const tweets = result.data?.data || [];
    const buzzy = tweets.filter(t => (t.public_metrics?.like_count || 0) >= 30);
    console.log(`[Researcher] X検索: ${tweets.length}件取得 → バズ${buzzy.length}件`);

    return buzzy.map(t => {
      const likes = t.public_metrics?.like_count || 0;
      const text = t.text || '';
      return {
        title: (text.slice(0, 60) + (text.length > 60 ? '…' : '')).replace(/\n/g, ' '),
        source_url: `https://twitter.com/i/web/status/${t.id}`,
        source_name: 'X バズ投稿',
        source_type: 'SNS',
        platform: 'x',
        layer: 'MICRO',
        theme_tag: 'バズ',
        collected_at: new Date().toISOString(),
        first_published: t.created_at ? t.created_at.split('T')[0] : TODAY,
        summary_ja: text.slice(0, 200),
        japan_circulation: 'バズ済み',
        likes,
        buzz_level: likes >= 100 ? 'バズ' : 'プチバズ',
        author: '@' + (userMap[t.author_id] || t.author_id),
      };
    });
  } catch (e) {
    console.error('[Researcher] X バズ収集エラー（スキップ）:', e.message);
    return [];
  }
}

/**
 * ダミーデータ（テスト用）
 */
function getDummyData() {
  return [
    {
      title: 'Claude新機能：プロジェクト管理機能追加',
      source_url: 'https://anthropic.com/news',
      source_name: 'Anthropic公式',
      layer: 'MICRO',
      theme_tag: 'ツール',
      collected_at: new Date().toISOString(),
      first_published: TODAY,
      summary_ja: 'Anthropicがプロジェクト管理機能を追加。カスタムインストラクションと会話履歴の永続化が可能に。クリエイターのワークフロー管理に活用できる。',
      source_type: '公式',
      japan_circulation: '一部流通',
    },
    {
      title: 'Runway Gen-4がリリース：映像制作が変わる',
      source_url: 'https://runway.ml',
      source_name: 'Runway公式Blog',
      layer: 'MIDDLE',
      theme_tag: 'ツール',
      collected_at: new Date().toISOString(),
      first_published: TODAY,
      summary_ja: 'Runway Gen-4が正式リリース。一貫したキャラクターとシーンで長尺動画の生成が可能に。映像ディレクターの仕事の仕方が変わる可能性。',
      source_type: '公式',
      japan_circulation: '未流通',
    },
    {
      title: 'AI生成物の著作権、文化庁が新ガイドライン',
      source_url: 'https://bunka.go.jp',
      source_name: '文化庁',
      layer: 'MACRO',
      theme_tag: '著作権',
      collected_at: new Date().toISOString(),
      first_published: TODAY,
      summary_ja: '文化庁がAI生成コンテンツの著作権に関する新ガイドラインを発表。クライアントワークへの影響と対応策を整理する必要がある。',
      source_type: '法律',
      japan_circulation: 'バズ済み',
    },
  ];
}

/**
 * メイン処理
 */
async function main(testMode = false) {
  console.log(`[Researcher] 起動 - ${TODAY} (テストモード: ${testMode})`);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let allItems = [];

  if (testMode) {
    allItems = getDummyData();
    console.log(`[Researcher] ダミーデータ使用: ${allItems.length}件`);
  } else {
    // MICRO（毎日）
    console.log('[Researcher] MICRO層 収集中...');
    const microItems = await researchLayer('MICRO');
    allItems.push(...microItems);
    console.log(`[Researcher] MICRO: ${microItems.length}件`);

    // X バズ投稿収集
    console.log('[Researcher] X バズ投稿 収集中...');
    const xBuzzItems = await searchXBuzz();
    if (xBuzzItems.length > 0) {
      allItems.push(...xBuzzItems);
      console.log(`[Researcher] X バズ: ${xBuzzItems.length}件`);
    }

    // MIDDLE（月水金のみ）
    const dayOfWeek = new Date().getDay();
    if ([1, 3, 5].includes(dayOfWeek)) {
      console.log('[Researcher] MIDDLE層 収集中...');
      const middleItems = await researchLayer('MIDDLE');
      allItems.push(...middleItems);
      console.log(`[Researcher] MIDDLE: ${middleItems.length}件`);
    }

    // MACRO（日曜のみ）
    if (dayOfWeek === 0) {
      console.log('[Researcher] MACRO層 収集中...');
      const macroItems = await researchLayer('MACRO');
      allItems.push(...macroItems);
      console.log(`[Researcher] MACRO: ${macroItems.length}件`);
    }
  }

  // 既存データと統合
  let existing = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    } catch {}
  }

  const merged = [...existing, ...allItems];
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));
  console.log(`[Researcher] 完了 - 合計${merged.length}件を ${OUTPUT_FILE} に保存`);

  return merged;
}

// 直接実行
if (require.main === module) {
  const testMode = process.argv.includes('--test');
  main(testMode).catch(console.error);
}

module.exports = { main };
