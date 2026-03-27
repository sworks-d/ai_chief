/**
 * 承認UIサーバー
 * Sが毎朝5〜10分触る唯一の画面のバックエンド
 * アクセス：http://localhost:3001
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const poster = require('./agents/poster');
const analyst = require('./agents/analyst');

const app = express();
const PORT = process.env.PORT || 3001;

const DATA_DIR = path.join(__dirname, 'data');
const PERSONAS_DIR = path.join(DATA_DIR, 'personas');
const METRICS_DIR = path.join(DATA_DIR, 'metrics');
const PEOPLE_CACHE = path.join(DATA_DIR, 'people_cache.json');
const PEOPLE_INSIGHTS = path.join(DATA_DIR, 'people_insights.json');
const API_STATUS_FILE = path.join(DATA_DIR, 'api_status.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));

// ユーティリティ：今日の日付
function getToday() {
  return new Date().toISOString().split('T')[0];
}

// ユーティリティ：ファイル読み込み（エラー時は空配列/オブジェクト）
function readJSON(filePath, fallback = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return fallback;
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================
// API: インプット（リサーチ結果）
// ============================

/**
 * GET /api/research
 * 今日のリサーチ結果（ファクトチェック済み）
 */
app.get('/api/research', (req, res) => {
  const today = getToday();
  const date = req.query.date || today;
  const checkedFile = path.join(DATA_DIR, 'checked', `${date}.json`);
  const items = readJSON(checkedFile);

  const featured = items.filter(i => i.is_featured).slice(0, 3);
  const caution = items.filter(i => i.info_type === 'TYPE_C');

  // all: is_featured=true を先頭に、残りをcollected_at新しい順
  const featItems = items.filter(i => i.is_featured && i.info_type !== 'NG');
  const restItems = items
    .filter(i => !i.is_featured && i.info_type !== 'NG')
    .sort((a, b) => new Date(b.collected_at || 0) - new Date(a.collected_at || 0));
  const all = [...featItems, ...restItems];

  res.json({ featured, caution, all, total: items.length, date });
});

// ============================
// API: 承認キュー
// ============================

/**
 * GET /api/queue
 * 今日の投稿キュー（品質スコア高い順）
 */
app.get('/api/queue', (req, res) => {
  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);

  // pending のみ返す（品質スコア順）
  const pending = queue
    .filter(p => p.status === 'pending')
    .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

  res.json(pending);
});

/**
 * POST /api/approve/:id
 * 投稿を承認する
 */
app.post('/api/approve/:id', (req, res) => {
  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);

  const idx = queue.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: '投稿が見つかりません' });
  }

  queue[idx].status = 'approved';
  queue[idx].approved_at = new Date().toISOString();
  writeJSON(queueFile, queue);

  console.log(`[Server] 承認: ${queue[idx].platform} - ${queue[idx].post_text?.slice(0, 30)}...`);
  res.json({ success: true, post: queue[idx] });
});

/**
 * POST /api/reject/:id
 * 投稿をNGにする
 */
app.post('/api/reject/:id', (req, res) => {
  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);

  const idx = queue.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: '投稿が見つかりません' });
  }

  queue[idx].status = 'rejected';
  queue[idx].rejected_at = new Date().toISOString();
  writeJSON(queueFile, queue);

  res.json({ success: true });
});

/**
 * POST /api/post-thread-now/:groupId
 * THREAD型グループを承認+即時X thread投稿（セットOKボタン用）
 */
app.post('/api/post-thread-now/:groupId', async (req, res) => {
  const result = await poster.postThreadGroupNow(req.params.groupId);
  if (!result.success) {
    return res.status(500).json(result);
  }
  res.json(result);
});

/**
 * POST /api/queue/add
 * INPUTパネル「投稿に使う」→ writer.jsで投稿生成してキューに追加
 */
app.post('/api/queue/add', async (req, res) => {
  const item = req.body;
  if (!item || !item.title) {
    return res.status(400).json({ error: 'item情報が不足しています（title必須）' });
  }
  try {
    const writer = require('./agents/writer');
    const today = getToday();
    const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);

    const xPost = await writer.generateShortPost(item, 'X');
    if (!xPost || (xPost.quality_score || 0) < 7.0) {
      return res.status(400).json({ error: '品質基準（7.0）を満たす投稿が生成できませんでした' });
    }
    const postObj = {
      ...xPost,
      id: `${today}-X-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      platform: 'X',
      source_item: item,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    // source_url付与（公式・業界メディアのみ）
    if (item.source_url && ['公式', '業界メディア'].includes(item.source_type)) {
      postObj.post_text = postObj.post_text + '\n' + item.source_url;
      postObj.source_url = item.source_url;
    }

    const queue = readJSON(queueFile);
    queue.push(postObj);
    writeJSON(queueFile, queue);

    console.log(`[Server] キューに追加: ${postObj.post_text.slice(0, 40)}...`);
    res.json({ success: true, post: postObj });
  } catch (e) {
    console.error('[Server] queue/add error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/approve-group/:groupId
 * THREAD型グループを一括承認
 */
app.post('/api/approve-group/:groupId', (req, res) => {
  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);
  const groupId = req.params.groupId;

  const targets = queue.filter(p => p.thread_group === groupId && p.status === 'pending');
  if (targets.length === 0) {
    return res.status(404).json({ error: 'グループが見つかりません' });
  }
  const now = new Date().toISOString();
  for (const p of targets) {
    p.status = 'approved';
    p.approved_at = now;
  }
  writeJSON(queueFile, queue);
  console.log(`[Server] グループ承認: ${groupId} (${targets.length}件)`);
  res.json({ success: true, count: targets.length });
});

/**
 * POST /api/reject-group/:groupId
 * THREAD型グループを一括却下
 */
app.post('/api/reject-group/:groupId', (req, res) => {
  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);
  const groupId = req.params.groupId;

  const targets = queue.filter(p => p.thread_group === groupId && p.status === 'pending');
  if (targets.length === 0) {
    return res.status(404).json({ error: 'グループが見つかりません' });
  }
  const now = new Date().toISOString();
  for (const p of targets) {
    p.status = 'rejected';
    p.rejected_at = now;
  }
  writeJSON(queueFile, queue);
  console.log(`[Server] グループ却下: ${groupId} (${targets.length}件)`);
  res.json({ success: true, count: targets.length });
});

/**
 * POST /api/edit/:id
 * 投稿を編集して承認
 */
app.post('/api/edit/:id', (req, res) => {
  const { post_text } = req.body;
  if (!post_text) {
    return res.status(400).json({ error: 'post_textが必要です' });
  }

  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);

  const idx = queue.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: '投稿が見つかりません' });
  }

  queue[idx].post_text = post_text;
  queue[idx].status = 'approved';
  queue[idx].edited = true;
  queue[idx].approved_at = new Date().toISOString();
  writeJSON(queueFile, queue);

  console.log(`[Server] 編集承認: ${queue[idx].platform}`);
  res.json({ success: true, post: queue[idx] });
});

// ============================
// API: 数字・分析
// ============================

/**
 * GET /api/metrics
 * 最新メトリクスと分析サマリー
 */
app.get('/api/metrics', (req, res) => {
  const today = getToday();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  // 昨日のメトリクス
  const yesterdayMetrics = readJSON(path.join(METRICS_DIR, `${yesterday}.json`));

  // 直近7日のフォロワー推移（将来の拡張のためプレースホルダー）
  const followerTrend = [];

  // 最新アナリストサマリー
  const analysisFiles = fs.existsSync(PERSONAS_DIR)
    ? fs.readdirSync(PERSONAS_DIR)
        .filter(f => f.startsWith('daily_'))
        .sort()
        .reverse()
    : [];

  const latestAnalysis = analysisFiles.length > 0
    ? readJSON(path.join(PERSONAS_DIR, analysisFiles[0]), {})
    : {};

  // 週次サマリー（最新）
  const weeklyFiles = fs.existsSync(PERSONAS_DIR)
    ? fs.readdirSync(PERSONAS_DIR)
        .filter(f => f.startsWith('weekly_'))
        .sort()
        .reverse()
    : [];

  const latestWeekly = weeklyFiles.length > 0
    ? readJSON(path.join(PERSONAS_DIR, weeklyFiles[0]), {})
    : {};

  // 月次ペルソナ（最新）
  const monthlyFiles = fs.existsSync(PERSONAS_DIR)
    ? fs.readdirSync(PERSONAS_DIR)
        .filter(f => f.startsWith('monthly_'))
        .sort()
        .reverse()
    : [];

  const latestPersona = monthlyFiles.length > 0
    ? readJSON(path.join(PERSONAS_DIR, monthlyFiles[0]), {})
    : {};

  // MVPと平均算出
  let mvpPost = null;
  let avgLikeRate = 0;
  let avgSaveRate = 0;
  let totalImpression = 0;

  if (yesterdayMetrics.length > 0) {
    const withMetrics = yesterdayMetrics.filter(m => m.metrics_24h);
    if (withMetrics.length > 0) {
      withMetrics.sort((a, b) => {
        const aLikes = (a.metrics_24h?.likes || 0);
        const bLikes = (b.metrics_24h?.likes || 0);
        return bLikes - aLikes;
      });
      mvpPost = withMetrics[0];

      const rates = withMetrics.map(m => {
        const imp = m.metrics_24h?.impressions || 1;
        return {
          likeRate: (m.metrics_24h?.likes || 0) / imp,
          saveRate: (m.metrics_24h?.saves || 0) / imp,
          imp: m.metrics_24h?.impressions || 0,
        };
      });

      avgLikeRate = rates.reduce((s, r) => s + r.likeRate, 0) / rates.length;
      avgSaveRate = rates.reduce((s, r) => s + r.saveRate, 0) / rates.length;
      totalImpression = rates.reduce((s, r) => s + r.imp, 0);
    }
  }

  res.json({
    yesterday: {
      total_impressions: totalImpression,
      avg_like_rate: avgLikeRate,
      avg_save_rate: avgSaveRate,
      post_count: yesterdayMetrics.length,
    },
    mvp_post: mvpPost ? {
      content: mvpPost.content?.slice(0, 100),
      platform: mvpPost.platform,
      likes: mvpPost.metrics_24h?.likes || 0,
      saves: mvpPost.metrics_24h?.saves || 0,
      impressions: mvpPost.metrics_24h?.impressions || 0,
    } : null,
    analyst_summary: latestAnalysis.feedback_to_writer || [],
    weekly_summary: latestWeekly.approval_ui_summary || null,
    personas: latestPersona,
    follower_trend: followerTrend,
  });
});

/**
 * GET /api/queue/all
 * 承認済み・投稿済み・失敗済みの投稿一覧（承認済みタブ用）
 */
app.get('/api/queue/all', (req, res) => {
  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);

  const done = queue
    .filter(p => ['approved', 'posted', 'failed', 'rejected'].includes(p.status))
    .sort((a, b) => {
      const ta = new Date(b.approved_at || b.created_at || 0);
      const tb = new Date(a.approved_at || a.created_at || 0);
      return ta - tb;
    });

  res.json(done);
});

/**
 * PATCH /api/queue/:id
 * 投稿のプラットフォームを切り替え（X ↔ Threads）
 */
app.patch('/api/queue/:id', (req, res) => {
  const { platform } = req.body;
  if (!['X', 'Threads'].includes(platform)) {
    return res.status(400).json({ error: 'platformはX/Threadsのみ有効' });
  }

  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);

  const idx = queue.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '投稿が見つかりません' });

  queue[idx].platform = platform;
  writeJSON(queueFile, queue);

  console.log(`[Server] プラットフォーム変更: ${req.params.id} → ${platform}`);
  res.json({ success: true, platform });
});

/**
 * DELETE /api/queue/:id
 * 投稿をキューから削除
 */
app.delete('/api/queue/:id', (req, res) => {
  const today = getToday();
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);
  const queue = readJSON(queueFile);

  const filtered = queue.filter(p => p.id !== req.params.id);
  if (filtered.length === queue.length) {
    return res.status(404).json({ error: '投稿が見つかりません' });
  }

  writeJSON(queueFile, filtered);
  console.log(`[Server] 削除: ${req.params.id}`);
  res.json({ success: true });
});

/**
 * POST /api/post-now/:id
 * 今すぐ投稿（時間帯スロット無視）
 */
app.post('/api/post-now/:id', async (req, res) => {
  try {
    const result = await poster.postSingle(req.params.id);
    res.json(result);
  } catch (e) {
    console.error('[Server] 即時投稿エラー:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * GET /api/posts/published
 * 投稿済み一覧（data/posts/ 以下の全JSONを収集・最新順）
 */
app.get('/api/posts/published', (req, res) => {
  const postsDir = path.join(DATA_DIR, 'posts');
  if (!fs.existsSync(postsDir)) return res.json([]);

  const posts = [];
  try {
    const dateDirs = fs.readdirSync(postsDir)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

    for (const dateDir of dateDirs) {
      const dirPath = path.join(postsDir, dateDir);
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const post = readJSON(path.join(dirPath, file), null);
        if (post && post.posted_at) posts.push(post);
      }
    }
  } catch {}

  posts.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));
  res.json(posts.slice(0, 30));
});

/**
 * GET /api/status
 * システム状態 + API残量確認（B-3）
 */
app.get('/api/status', async (req, res) => {
  const today = getToday();
  const checkedFile = path.join(DATA_DIR, 'checked', `${today}.json`);
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);

  const checked = readJSON(checkedFile);
  const queue = readJSON(queueFile);

  // X API残量（poster.jsが記録したapi_status.jsonから読む）
  const apiStatus = readJSON(API_STATUS_FILE, {});

  // Anthropic残高（APIから取得を試みる）
  let anthropicBalance = null;
  try {
    const resp = await axios.get('https://api.anthropic.com/v1/organizations/me', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      timeout: 3000,
    });
    anthropicBalance = resp.data?.billing?.available_credit_usd ?? null;
  } catch {
    // API取得失敗はスキップ
  }

  res.json({
    date: today,
    research: { count: checked.length, has_data: checked.length > 0 },
    queue: {
      total: queue.length,
      pending: queue.filter(p => p.status === 'pending').length,
      approved: queue.filter(p => p.status === 'approved').length,
      posted: queue.filter(p => p.status === 'posted').length,
      rejected: queue.filter(p => p.status === 'rejected').length,
    },
    anthropic: {
      balance: anthropicBalance,
    },
    x: {
      posts_remaining: apiStatus.posts_remaining ?? null,
      posts_limit: apiStatus.posts_limit ?? 1500,
      reset_date: apiStatus.reset_date ?? null,
    },
  });
});

// ============================
// API: PEOPLEパネル（A-8b）
// ============================

/**
 * GET /api/people
 * people_cache.json を返す
 */
app.get('/api/people', (req, res) => {
  const cache = readJSON(PEOPLE_CACHE, { watch: [], engage: [], similar: [] });
  res.json(cache);
});

/**
 * POST /api/people/analyze
 * アカウントの投稿をanalyst.jsで分析してpeople_insights.jsonに保存
 * body: { account: "@handle", tweets: [...] }
 */
app.post('/api/people/analyze', async (req, res) => {
  const { account, tweets } = req.body;
  if (!account) {
    return res.status(400).json({ error: 'accountが必要です' });
  }

  try {
    console.log(`[Server] 投稿分析: ${account}`);
    const result = await analyst.analyzeAccount(account, tweets || []);
    if (!result) {
      return res.status(500).json({ success: false, error: '分析に失敗しました' });
    }
    res.json({ success: true, analysis: result });
  } catch (e) {
    console.error('[Server] analyze error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * POST /api/people/reflect
 * people_insights.jsonを全エージェントが参照できる状態に確定保存
 */
app.post('/api/people/reflect', (req, res) => {
  if (!fs.existsSync(PEOPLE_INSIGHTS)) {
    return res.status(404).json({ error: 'people_insights.jsonがありません' });
  }
  const insights = readJSON(PEOPLE_INSIGHTS, { insights: [] });
  insights.reflected_at = new Date().toISOString();
  writeJSON(PEOPLE_INSIGHTS, insights);
  console.log(`[Server] people_insights.json を全エージェントに反映`);
  res.json({ success: true, count: insights.insights.length });
});

// ============================
// フロントエンドルーティング
// ============================

// マニュアルページ（B-2）
app.get('/manual', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'manual.html'));
});

// UIへのフォールバック
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'approval.html'));
});

// サーバー起動
app.listen(PORT, () => {
  console.log('=================================');
  console.log('余白のAI が起動しました');
  console.log(`ローカル：http://localhost:${PORT}`);
  console.log('外部アクセス → 別ターミナルで: npm run tunnel');
  console.log('=================================');
});

module.exports = app;
