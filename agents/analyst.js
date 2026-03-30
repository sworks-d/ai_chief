/**
 * エージェント6：アナリスト
 * 役割：「なぜ伸びたか」の仮説を立て、次の投稿の精度を上げる
 * 実行タイミング：日次深夜1:00 / 週次月曜朝6:00 / 月次毎月1日
 */

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const METRICS_DIR = path.join(__dirname, '..', 'data', 'metrics');
const PERSONAS_DIR = path.join(__dirname, '..', 'data', 'personas');
const FEEDBACK_LOG = path.join(__dirname, '..', 'doc', '08_feedback_log.md');
const PEOPLE_INSIGHTS = path.join(__dirname, '..', 'data', 'people_insights.json');

/**
 * 週番号を取得（YYYY-WW形式）
 */
function getWeekNumber() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-${String(wk).padStart(2, '0')}`;
}

/**
 * 日次分析
 */
async function dailyAnalysis(metricsData) {
  if (metricsData.length === 0) return null;

  let postsStr = "";
  const mediaParts = [];

  metricsData.forEach((m, idx) => {
    const m1h = m.metrics_1h || {};
    const m24h = m.metrics_24h || {};
    postsStr += `
[投稿 ${idx + 1}]
投稿ID: ${m.post_id || m.content?.slice(0, 20)}
プラットフォーム: ${m.platform}
型: ${m.post_type}
テーマ: ${m.theme_tag}
キャラタグ: ${m.character_tag || 'なし'}
画像添付: ${m.media_path ? 'あり（画像データ参照）' : 'なし'}
1h: imp=${m1h.impressions || 0}, likes=${m1h.likes || 0}, saves=${m1h.saves || 0}
24h: imp=${m24h.impressions || 0}, likes=${m24h.likes || 0}, saves=${m24h.saves || 0}
本文先頭: ${(m.content || '').slice(0, 50)}...
---`;
    if (m.media_path && fs.existsSync(m.media_path)) {
      mediaParts.push({
        inlineData: {
          data: fs.readFileSync(m.media_path).toString("base64"),
          mimeType: "image/png"
        }
      });
    }
  });

  const prompt = `あなたはSNS分析エージェントです。
以下の投稿メトリクスを分析して、日次レポートをJSONで出力してください。

投稿データ：
${postsStr}

分析視点：
1. 初速判定（1時間後）
   - 好調基準：いいね率≥0.5%、保存率≥0.2%
   - パターン：「初速◎×24h◎」「初速◎×24h失速」「初速△×24h◎（保存型）」

2. 仮説生成
   - なぜAが伸びてBが伸びなかったか
   - 1行目の型、登場関係者、テーマ、カウンター構造、締め方、時間帯

3. 明日への提案
   - リサーチャーへ：どのテーマを優先収集すべきか
   - ライターへ：どの型・関係者・1行目スタイルを使うべきか

JSONのみ出力してください：
{
  "date": "${new Date().toISOString().split('T')[0]}",
  "analysis_type": "daily",
  "mvp_post": {
    "post_id": "最もパフォーマンスが高い投稿のID",
    "reason": "なぜ伸びたかの仮説（1〜2行）"
  },
  "patterns": {
    "hot": ["伸びたパターン（型・テーマ・関係者など）"],
    "cold": ["伸びなかったパターン"]
  },
  "hypotheses": ["仮説1", "仮説2", "仮説3"],
  "feedback_to_researcher": ["リサーチャーへの指示1", "指示2"],
  "feedback_to_writer": ["ライターへの指示1", "指示2", "指示3"],
  "overall_score": {
    "avg_like_rate": 0.0,
    "avg_save_rate": 0.0,
    "top_platform": "X | Threads"
  }
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [{ text: prompt }, ...mediaParts],
    config: {
      systemInstruction: 'あなたはSNS分析エージェントです。画像とテキストを組み合わせたマルチモーダル解析を行います。',
      responseMimeType: 'application/json',
    }
  });

  const text = response.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    console.error('[Analyst] daily analysis parse error:', e.message);
    return null;
  }
}

/**
 * 週次分析
 */
async function weeklyAnalysis(allMetrics) {
  if (allMetrics.length === 0) return null;

  // 型別・テーマ別・時間帯別の集計
  const byType = {};
  const byTheme = {};
  const byChar = {};

  for (const m of allMetrics) {
    const m24h = m.metrics_24h || {};
    const imp = m24h.impressions || 0;
    const likes = m24h.likes || 0;
    const saves = m24h.saves || 0;
    const likeRate = imp > 0 ? likes / imp : 0;
    const saveRate = imp > 0 ? saves / imp : 0;

    const type = m.post_type || '不明';
    if (!byType[type]) byType[type] = { count: 0, totalLikeRate: 0, totalSaveRate: 0 };
    byType[type].count++;
    byType[type].totalLikeRate += likeRate;
    byType[type].totalSaveRate += saveRate;

    const theme = m.theme_tag || '不明';
    if (!byTheme[theme]) byTheme[theme] = { count: 0, totalLikeRate: 0, totalSaveRate: 0 };
    byTheme[theme].count++;
    byTheme[theme].totalLikeRate += likeRate;
    byTheme[theme].totalSaveRate += saveRate;

    const char = m.character_tag || 'なし';
    if (!byChar[char]) byChar[char] = { count: 0, totalLikeRate: 0, totalSaveRate: 0 };
    byChar[char].count++;
    byChar[char].totalLikeRate += likeRate;
    byChar[char].totalSaveRate += saveRate;
  }

  const mediaParts = [];
  allMetrics.forEach(m => {
    if (m.media_path && fs.existsSync(m.media_path)) {
      // 重複・過剰なトークンを防ぐため、サンプリングするか全部入れるか（Geminiは2Mなので今回は全部入れる）
      mediaParts.push({
        inlineData: {
          data: fs.readFileSync(m.media_path).toString("base64"),
          mimeType: "image/png"
        }
      });
    }
  });

  const statsStr = JSON.stringify({ byType, byTheme, byChar }, null, 2);

  const prompt = `あなたはSNS週次分析エージェントです。
以下の1週間の投稿パフォーマンスデータを分析して、週次レポートをJSONで出力してください。

集計データ：
${statsStr}

分析してください：
1. 型別（①〜⑦）の平均いいね率・保存率ランキング
2. テーマ別ランキング（TOP3・ワースト）
3. 関係者別のパフォーマンス
4. フォロワー質の推測（保存率が高い = note購買層に近い）
5. 来週の推奨方針

JSONのみ出力してください：
{
  "analysis_type": "weekly",
  "week_start": "${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}",
  "top_post_types": ["最もパフォーマンスが高い型トップ3"],
  "top_themes": ["伸びたテーマTOP3"],
  "bottom_themes": ["落ちたテーマ"],
  "character_insights": ["関係者に関するインサイト"],
  "note_potential_themes": ["note購買層が反応したテーマ（保存率高）"],
  "next_week_strategy": "来週の推奨方針（2〜3行）",
  "approval_ui_summary": {
    "mvp": "今週MVP投稿の要約",
    "rising": "伸びてるパターン",
    "declining": "落ちてきてるパターン",
    "recommendation": "来週の一言方針"
  }
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [{ text: prompt }, ...mediaParts.slice(0, 50)], // API上限を考慮して最大50枚に制限
    config: {
      systemInstruction: 'あなたはSNS週次分析エージェントです。画像データも参照して視覚的要素とパフォーマンスの相関を分析してください。',
      responseMimeType: 'application/json',
    }
  });

  const text = response.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    console.error('[Analyst] weekly analysis parse error:', e.message);
    return null;
  }
}

/**
 * 週次分析結果をdoc/08_feedback_log.mdに自動追記（A-5）
 */
function appendToFeedbackLog(weeklyResult, engageCorrelation = null) {
  if (!weeklyResult) return;
  const weekId = getWeekNumber();

  const hotPatterns = (weeklyResult.top_post_types || []).map(t => `- 型：${t} × テーマ：${(weeklyResult.top_themes || [])[0] || '—'}\n  理由（仮説）：AIが分析したパフォーマンスデータより`).join('\n');
  const coldPatterns = (weeklyResult.bottom_themes || []).map(t => `- テーマ：${t}\n  理由（仮説）：パフォーマンスが低かったため`).join('\n');
  const engageSection = engageCorrelation
    ? `\n### 絡んだアカウントとフォロワー増加の相関\n${engageCorrelation}\n`
    : '';

  const entry = `\n## ${weekId}（自動追記）\n
### 今週伸びたパターン\n${hotPatterns || '- データ不足'}\n
### 今週伸びなかったパターン\n${coldPatterns || '- データ不足'}${engageSection}
### 意外な発見\n- ${weeklyResult.next_week_strategy ? weeklyResult.next_week_strategy.slice(0, 80) : 'データ蓄積中'}\n
### ルール化の提案（Sの判断待ち）\n- [ ] 上位型（${(weeklyResult.top_post_types || []).slice(0,2).join('/')}）の投稿比率を高める\n`;

  try {
    const existing = fs.existsSync(FEEDBACK_LOG) ? fs.readFileSync(FEEDBACK_LOG, 'utf-8') : '';
    // ## ログ の後に挿入（最新が上に来るように）
    const insertPoint = existing.indexOf('## ログ');
    if (insertPoint === -1) {
      fs.appendFileSync(FEEDBACK_LOG, entry);
    } else {
      const insertAfter = insertPoint + '## ログ'.length;
      const commentEnd = existing.indexOf('\n', existing.indexOf('<!-- アナリストが毎週自動追記'));
      const pos = commentEnd > insertAfter ? commentEnd + 1 : insertAfter + 1;
      const newContent = existing.slice(0, pos) + '\n' + entry + existing.slice(pos);
      fs.writeFileSync(FEEDBACK_LOG, newContent);
    }
    console.log(`[Analyst] doc/08_feedback_log.md に週次サマリーを追記 (${weekId})`);
  } catch (e) {
    console.error('[Analyst] feedback_log 追記エラー:', e.message);
  }
}

/**
 * engage_log.jsonを読み込んでフォロワー増加との相関テキストを生成（A-8）
 */
function analyzeEngageLog() {
  const engageFile = path.join(__dirname, '..', 'data', 'engage_log.json');
  if (!fs.existsSync(engageFile)) return null;
  try {
    const log = JSON.parse(fs.readFileSync(engageFile, 'utf-8'));
    if (!log || log.length === 0) return null;
    const summary = log.slice(-10).map(e => `${e.account}（${e.follower_change > 0 ? '+' : ''}${e.follower_change || 0}フォロワー増減）`).join('、');
    return `直近の絡み先：${summary}`;
  } catch {
    return null;
  }
}

/**
 * X上のアカウント投稿を分析してpeople_insights.jsonに保存（A-8b）
 */
async function analyzeAccount(account, tweets) {
  if (!tweets || tweets.length === 0) return null;

  const tweetsStr = tweets.slice(0, 20).map((t, i) =>
    `[${i+1}] ${t.text?.slice(0, 120) || ''} (❤${t.public_metrics?.like_count || 0})`
  ).join('\n');

  const prompt = `以下のXアカウント（${account}）の投稿を分析してください。

投稿一覧（最大20件）：
${tweetsStr}

以下の視点で分析し、JSONで出力してください：
1. 1行目の構造パターン（疑問形・数字・体験談・断言のどれが多いか）
2. 投稿の型の傾向（比較・正直・tips・問いかけ・体験談）
3. 頻出キーワード・フレーズ・特徴的な語尾（5個まで）
4. いいねが多い投稿と少ない投稿の差
5. AIクリエイター・制作現場ジャンルに置き換えた投稿例を1本

JSONのみ出力：
{
  "account": "${account}",
  "analyzed_at": "${new Date().toISOString()}",
  "first_line_pattern": "疑問形|数字|体験談|断言",
  "top_types": ["型①", "型⑤"],
  "keywords": ["頻出語1", "頻出語2", "頻出語3"],
  "buzz_pattern": "バズパターンの1行要約",
  "high_vs_low": "いいねが多い/少ない投稿の差の仮説",
  "sample_post": "Sのジャンルで生成した投稿例（140文字以内）",
  "trust_level": "HIGH|MID|LOW"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: prompt,
    config: {
      systemInstruction: 'あなたはSNS投稿パターン分析の専門家です。バズ投稿の構造を客観的に分析します。',
      responseMimeType: 'application/json',
    }
  });

  const text = response.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!result) return null;

    // people_insights.jsonに追記・更新
    let insights = { insights: [] };
    if (fs.existsSync(PEOPLE_INSIGHTS)) {
      try { insights = JSON.parse(fs.readFileSync(PEOPLE_INSIGHTS, 'utf-8')); } catch {}
    }
    const idx = insights.insights.findIndex(i => i.account === account);
    if (idx !== -1) {
      insights.insights[idx] = result;
    } else {
      insights.insights.push(result);
    }
    insights.updated_at = new Date().toISOString();
    fs.writeFileSync(PEOPLE_INSIGHTS, JSON.stringify(insights, null, 2));
    console.log(`[Analyst] people_insights.json を更新: ${account}`);

    return result;
  } catch (e) {
    console.error('[Analyst] analyzeAccount parse error:', e.message);
    return null;
  }
}

/**
 * ターゲット人物像の更新（月次）
 */
async function updatePersonas(allMetrics) {
  if (allMetrics.length === 0) return null;

  // 保存率・リポスト率が高い投稿を抽出
  const enriched = allMetrics.map(m => {
    const m24h = m.metrics_24h || {};
    const imp = m24h.impressions || 1;
    return {
      ...m,
      save_rate: (m24h.saves || 0) / imp,
      like_rate: (m24h.likes || 0) / imp,
      repost_rate: (m24h.reposts || 0) / imp,
    };
  }).sort((a, b) => b.save_rate - a.save_rate);

  const topPosts = enriched.slice(0, 10);
  const postsStr = topPosts.map(m =>
    `型:${m.post_type} テーマ:${m.theme_tag} 保存率:${(m.save_rate * 100).toFixed(2)}% 本文:${(m.content || '').slice(0, 60)}`
  ).join('\n');

  const prompt = `あなたはターゲット分析エージェントです。
保存率・エンゲージメントが高い投稿データから、
「今このアカウントに引き寄せられている人物像」を具体的に分析してください。

高パフォーマンス投稿TOP10：
${postsStr}

Sのアカウントのターゲットは「AIで仕事を変えたいクリエイター」です。

以下の3層で人物像を描写してください：
- CORE層（A）：最も濃い反応をしている層
- GROW層（B）：拡大中の層
- WILD層（C）：意外な層・可能性がある

JSONのみ出力してください：
{
  "updated_at": "${new Date().toISOString()}",
  "analysis_period": "直近1ヶ月",
  "core_layer": {
    "description": "どんな状況にいるか（シーンで描写）",
    "reaction_pattern": "どんな反応パターンか",
    "best_content": "この層への刺さる投稿設計"
  },
  "grow_layer": {
    "description": "どんな状況にいるか",
    "reaction_pattern": "どんな反応パターンか",
    "best_content": "この層への刺さる投稿設計"
  },
  "wild_layer": {
    "description": "意外な層の特徴",
    "reaction_pattern": "どんな反応パターンか",
    "potential": "この層の可能性"
  },
  "note_buyer_profile": "noteを一番買いそうな人物の詳細描写",
  "content_strategy_hint": "これらの層を踏まえた来月のコンテンツ戦略提案"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: prompt,
    config: {
      systemInstruction: 'あなたはターゲット分析エージェントです。',
      responseMimeType: 'application/json',
    }
  });

  const text = response.text || '{}';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (e) {
    console.error('[Analyst] persona analysis parse error:', e.message);
    return null;
  }
}

/**
 * 過去N日分のメトリクスを読み込む
 */
function loadMetrics(days = 7) {
  const allMetrics = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const metricsFile = path.join(METRICS_DIR, `${date}.json`);
    if (fs.existsSync(metricsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
        allMetrics.push(...data);
      } catch {}
    }
  }
  return allMetrics;
}

/**
 * メイン処理
 * mode: 'daily' | 'weekly' | 'monthly'
 * forceMode: --force フラグ（メトリクスがなくてもテストデータで実行）
 */
async function main(mode = 'daily', testMode = false, forceMode = false) {
  console.log(`[Analyst] 起動 - ${mode}分析 (テストモード: ${testMode}, 強制: ${forceMode})`);

  if (!fs.existsSync(PERSONAS_DIR)) {
    fs.mkdirSync(PERSONAS_DIR, { recursive: true });
  }

  const days = mode === 'monthly' ? 30 : mode === 'weekly' ? 7 : 1;
  let metrics = loadMetrics(days);

  if (!testMode && !forceMode && metrics.length === 0) {
    console.warn(`[Analyst] メトリクスデータなし（Free Tier制限または未投稿）。分析をスキップします。`);
    return null;
  }

  // メトリクスが全てゼロ（Free Tier制限でスキップされた）場合も警告してスキップ
  if (!testMode && !forceMode) {
    const hasRealData = metrics.some(m =>
      (m.metrics_1h?.impressions || 0) > 0 || (m.metrics_24h?.impressions || 0) > 0
    );
    if (!hasRealData) {
      console.warn(`[Analyst] 有効なメトリクスがありません（Free Tier制限の可能性）。分析をスキップします。`);
      return null;
    }
  }

  if ((testMode || forceMode) && metrics.length === 0) {
    // テスト用ダミーメトリクス生成
    metrics = [{
      post_id: 'test_001',
      platform: 'X',
      content: 'ClaudeのProjectsを使い始めて、修正の往復が半分以下になった。',
      post_type: '型①',
      theme_tag: 'ツール',
      character_tag: '部下',
      metrics_1h: { impressions: 800, likes: 12, saves: 4, reposts: 2 },
      metrics_24h: { impressions: 3200, likes: 45, saves: 18, reposts: 8 },
    }];
  }

  const today = new Date().toISOString().split('T')[0];
  const outputFile = path.join(PERSONAS_DIR, `${mode}_${today}.json`);

  let result;
  if (mode === 'daily') {
    result = await dailyAnalysis(metrics);
  } else if (mode === 'weekly') {
    result = await weeklyAnalysis(metrics);
  } else if (mode === 'monthly') {
    result = await updatePersonas(metrics);
  }

  if (result) {
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
    console.log(`[Analyst] ${mode}分析完了 → ${outputFile}`);

    // 日次の場合はフィードバックを表示
    if (mode === 'daily' && result.feedback_to_writer) {
      console.log('\n[Analyst] ライターへのフィードバック:');
      result.feedback_to_writer.forEach(f => console.log(`  - ${f}`));
    }

    // 週次の場合はfeedback_log.mdに追記（A-5）
    if (mode === 'weekly') {
      const engageCorr = analyzeEngageLog();
      appendToFeedbackLog(result, engageCorr);
    }
  }

  return result;
}

if (require.main === module) {
  const testMode = process.argv.includes('--test');
  const forceMode = process.argv.includes('--force');
  const mode = process.argv.find(a => ['daily', 'weekly', 'monthly'].includes(a)) || 'daily';
  main(mode, testMode, forceMode).catch(console.error);
}

module.exports = { main, analyzeAccount };
