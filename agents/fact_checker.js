/**
 * エージェント2：ファクトチェッカー
 * 役割：「どの情報をどう出すか」を決める編集者
 * 実行タイミング：リサーチャーの出力後に自動起動
 */

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const TODAY = new Date().toISOString().split('T')[0];
const INPUT_DIR = path.join(__dirname, '..', 'data', 'research');
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'checked');
const INPUT_FILE = path.join(INPUT_DIR, `${TODAY}.json`);
const OUTPUT_FILE = path.join(OUTPUT_DIR, `${TODAY}.json`);

/**
 * HIGH信頼アカウントリストを読み込む（people_cache.json）
 */
function loadHighTrustAccounts() {
  const cacheFile = path.join(__dirname, '..', 'data', 'people_cache.json');
  const insightsFile = path.join(__dirname, '..', 'data', 'people_insights.json');
  const accounts = new Set();
  if (fs.existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      (cache.watch || []).filter(w => w.trust_level === 'HIGH').forEach(w => accounts.add(w.account));
    } catch {}
  }
  if (fs.existsSync(insightsFile)) {
    try {
      const insights = JSON.parse(fs.readFileSync(insightsFile, 'utf-8'));
      (insights.insights || []).filter(i => i.trust_level === 'HIGH').forEach(i => accounts.add(i.account));
    } catch {}
  }
  return accounts;
}

function upgradeTrust(trust) {
  if (trust === 'LOW') return 'MID';
  if (trust === 'MID') return 'HIGH';
  return trust;
}

/**
 * 情報の4タイプ判定とスコアリング
 */
async function checkItem(item) {
  const prompt = `あなたはAIとクリエイティブ業界に精通した編集者エージェントです。
以下の情報を評価してください。

情報：
タイトル：${item.title}
要約：${item.summary_ja}
ソース：${item.source_name}（${item.source_type}）
日本流通状況：${item.japan_circulation}
レイヤー：${item.layer}

以下の3軸で評価し、JSONで返してください：

1. 鮮度スコア（freshness）：
   - A：海外初出・日本未流通 → 最優先
   - B：海外初出・日本で一部流通 → 優先度高
   - C：日本でもバズってる → TYPE Bとして視点を乗せる
   - D：初出1ヶ月以上前 → 原則スキップ

2. 信頼度スコア（trust）：
   - HIGH：公式発表・査読あり論文・公的機関
   - MID：著名クリエイター・実績ある媒体（バイアス注意）
   - LOW：一次ソース不明・SNSのみ・個人ブログ

3. 有益性スコア（utility）：
   - HIGH：明日の仕事に使える・不安を解消できる
   - MID：知っておいて損はない
   - LOW：エンタメ寄り・直接の実用性は低い

4. 情報タイプ判定（info_type）：
   - TYPE_A：確度高×鮮度高 → そのまま発信
   - TYPE_B：確度高×バズってる → Sのオリジナル視点を乗せて発信
   - TYPE_C：確度が曖昧×面白さあり → メリット・リスク両論で発信
   - TYPE_D：確度低×話題性あり → 「未確認情報として」発信
   - NG：削除（人を傷つける・法を犯す・明確なデマ）

5. 推奨投稿視点（post_hint）：Sのクリエイティブディレクターの視点からの一言コメント

JSONのみ返してください：
{
  "freshness": "A|B|C|D",
  "trust": "HIGH|MID|LOW",
  "utility": "HIGH|MID|LOW",
  "info_type": "TYPE_A|TYPE_B|TYPE_C|TYPE_D|NG",
  "post_hint": "Sの視点からの投稿ヒント（1〜2行）",
  "ng_reason": "NGの場合のみ理由を記載、それ以外はnull"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    }
  });

  const text = response.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (e) {
    console.error('[FactChecker] parse error:', e.message);
    return { info_type: 'NG', ng_reason: 'parse error' };
  }
}

/**
 * メイン処理
 */
async function main(testMode = false) {
  console.log(`[FactChecker] 起動 - ${TODAY}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // リサーチャー出力を読み込み
  let items = [];
  if (testMode) {
    // テスト用：researcher.jsのダミーデータを使用
    const { main: researchMain } = require('./researcher');
    items = await researchMain(true);
  } else {
    if (!fs.existsSync(INPUT_FILE)) {
      console.error(`[FactChecker] 入力ファイルが見つかりません: ${INPUT_FILE}`);
      process.exit(1);
    }
    items = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  }

  console.log(`[FactChecker] ${items.length}件を評価中...`);

  const highTrustAccounts = loadHighTrustAccounts();
  const checkedItems = [];

  for (const item of items) {
    const evaluation = await checkItem(item);
    // HIGH信頼アカウントが発信してる情報は信頼度をワンランク上げる
    if (item.author && highTrustAccounts.has(item.author) && evaluation.trust !== 'HIGH') {
      evaluation.trust = upgradeTrust(evaluation.trust);
      console.log(`[FactChecker] 信頼度UP (${item.author}): ${evaluation.trust}`);
    }

    // NGはスキップ
    if (evaluation.info_type === 'NG') {
      console.log(`[FactChecker] NG: ${item.title} - ${evaluation.ng_reason}`);
      continue;
    }

    // TYPE_Bの場合、視点ヒントを追加
    let typeB_hint = null;
    if (evaluation.info_type === 'TYPE_B') {
      typeB_hint = {
        hint_type: '現場目線 | 時間軸の差 | 対比 | 疑問',
        hint: evaluation.post_hint,
      };
    }

    // TYPE_Cの場合、両論提示情報を追加
    let typeC_both = null;
    if (evaluation.info_type === 'TYPE_C') {
      typeC_both = {
        merit: '使えるメリット（ライターが補完）',
        risk: '注意点・リスク（ライターが補完）',
        post_direction: evaluation.post_hint,
      };
    }

    checkedItems.push({
      ...item,
      checked_at: new Date().toISOString(),
      freshness: evaluation.freshness,
      trust: evaluation.trust,
      utility: evaluation.utility,
      info_type: evaluation.info_type,
      post_hint: evaluation.post_hint,
      type_b_hint: typeB_hint,
      type_c_both: typeC_both,
      // 承認UIでの優先表示フラグ
      is_featured: evaluation.info_type === 'TYPE_A' &&
                   evaluation.freshness !== 'D' &&
                   evaluation.trust !== 'LOW',
    });
  }

  // 優先度でソート：TYPE_A > TYPE_B > TYPE_C > TYPE_D
  const order = { TYPE_A: 0, TYPE_B: 1, TYPE_C: 2, TYPE_D: 3 };
  checkedItems.sort((a, b) => (order[a.info_type] || 9) - (order[b.info_type] || 9));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(checkedItems, null, 2));
  console.log(`[FactChecker] 完了 - ${checkedItems.length}件を ${OUTPUT_FILE} に保存`);
  console.log(`[FactChecker] 内訳: ${Object.entries(
    checkedItems.reduce((acc, i) => {
      acc[i.info_type] = (acc[i.info_type] || 0) + 1;
      return acc;
    }, {})
  ).map(([k, v]) => `${k}:${v}`).join(', ')}`);

  return checkedItems;
}

if (require.main === module) {
  const testMode = process.argv.includes('--test');
  main(testMode).catch(console.error);
}

module.exports = { main };
