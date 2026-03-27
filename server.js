/**
 * 承認UIサーバー
 * Sが毎朝5〜10分触る唯一の画面のバックエンド
 * アクセス：http://localhost:3000
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const poster = require('./agents/poster');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const PERSONAS_DIR = path.join(DATA_DIR, 'personas');
const METRICS_DIR = path.join(DATA_DIR, 'metrics');

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
  const checkedFile = path.join(DATA_DIR, 'checked', `${today}.json`);
  const items = readJSON(checkedFile);

  // 承認UIに表示する形式に変換
  const featured = items.filter(i => i.is_featured).slice(0, 3);
  const caution = items.filter(i => i.info_type === 'TYPE_C').slice(0, 5);

  res.json({ featured, caution, total: items.length });
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
 * GET /api/status
 * システム状態確認
 */
app.get('/api/status', (req, res) => {
  const today = getToday();
  const checkedFile = path.join(DATA_DIR, 'checked', `${today}.json`);
  const queueFile = path.join(DATA_DIR, 'queue', `${today}.json`);

  const checked = readJSON(checkedFile);
  const queue = readJSON(queueFile);

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
  });
});

// ============================
// フロントエンドルーティング
// ============================

// UIへのフォールバック
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'approval.html'));
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`[Server] 承認UIサーバー起動 - http://localhost:${PORT}`);
  console.log(`[Server] スマホからのアクセス: http://[PCのIPアドレス]:${PORT}`);
});

module.exports = app;
