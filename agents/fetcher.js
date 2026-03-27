/**
 * エージェント5：フェッチャー
 * 役割：投稿後のメトリクスを自動取得してアナリストに渡す
 * 実行タイミング：投稿後1h・6h・24hに自動タイマー
 */

require('dotenv').config();
const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'data', 'posts');
const METRICS_DIR = path.join(__dirname, '..', 'data', 'metrics');
const LOGS_DIR = path.join(__dirname, '..', 'data', 'logs');

/**
 * エラーをログファイルに記録
 */
function logError(platform, postId, errorCode, errorMessage) {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  const errorFile = path.join(LOGS_DIR, 'fetcher-error.json');

  let errors = [];
  if (fs.existsSync(errorFile)) {
    try { errors = JSON.parse(fs.readFileSync(errorFile, 'utf-8')); } catch {}
  }

  errors.push({
    timestamp: new Date().toISOString(),
    platform,
    post_id: postId,
    error_code: errorCode,
    error_message: errorMessage,
  });

  fs.writeFileSync(errorFile, JSON.stringify(errors, null, 2));
  console.warn(`[Fetcher] エラーログ記録: ${platform} ${postId} - ${errorCode} (${errorMessage})`);
}

// X API クライアント
function getXClient() {
  return new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
}

/**
 * XのメトリクスをAPI v2で取得
 */
async function fetchXMetrics(postId) {
  try {
    const client = getXClient();
    const response = await client.v2.singleTweet(postId, {
      'tweet.fields': ['public_metrics', 'non_public_metrics', 'organic_metrics'],
    });

    const metrics = response.data?.public_metrics || {};
    const organic = response.data?.organic_metrics || {};

    return {
      impressions: organic.impression_count || 0,
      likes: metrics.like_count || 0,
      reposts: metrics.retweet_count || 0,
      replies: metrics.reply_count || 0,
      saves: organic.bookmark_count || 0,
      profile_clicks: organic.url_link_clicks || 0,
    };
  } catch (error) {
    const code = error.code || error.status || 'unknown';
    const msg = error.data?.detail || error.message;
    if (code === 402 || code === 403) {
      console.warn(`[Fetcher] X Free Tier制限によりメトリクス取得をスキップ (${code}): ${postId}`);
    } else {
      console.error(`[Fetcher] X metrics error for ${postId}:`, msg);
    }
    logError('X', postId, code, msg);
    return null;
  }
}

/**
 * ThreadsのメトリクスをGraph APIで取得
 */
async function fetchThreadsMetrics(postId) {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;

  try {
    const response = await axios.get(
      `https://graph.threads.net/v1.0/${postId}/insights`,
      {
        params: {
          metric: 'views,likes,replies,reposts,quotes',
          access_token: accessToken,
        },
      }
    );

    const data = response.data?.data || [];
    const metricsMap = {};
    data.forEach(m => {
      metricsMap[m.name] = m.values?.[0]?.value || 0;
    });

    return {
      impressions: metricsMap.views || 0,
      likes: metricsMap.likes || 0,
      replies: metricsMap.replies || 0,
      reposts: metricsMap.reposts || 0,
    };
  } catch (error) {
    const code = error.response?.status || error.code || 'unknown';
    const msg = error.response?.data?.error?.message || error.message;
    console.warn(`[Fetcher] Threadsメトリクス取得をスキップ (${code}): ${postId}`);
    logError('Threads', postId, code, msg);
    return null;
  }
}

/**
 * ダミーメトリクス（テスト用）
 */
function getDummyMetrics(platform, timeOffset) {
  const base = platform === 'X' ? 500 : 200;
  const multiplier = timeOffset === '1h' ? 1 : timeOffset === '6h' ? 2.5 : 4;

  return {
    impressions: Math.floor(base * multiplier * (0.8 + Math.random() * 0.4)),
    likes: Math.floor(base * multiplier * 0.01 * (0.8 + Math.random() * 0.4)),
    reposts: Math.floor(base * multiplier * 0.003 * (0.8 + Math.random() * 0.4)),
    replies: Math.floor(base * multiplier * 0.002 * (0.8 + Math.random() * 0.4)),
    saves: Math.floor(base * multiplier * 0.002 * (0.8 + Math.random() * 0.4)),
    profile_clicks: Math.floor(base * multiplier * 0.001 * (0.8 + Math.random() * 0.4)),
  };
}

/**
 * 投稿ファイルを取得してメトリクスを更新
 */
async function fetchAndUpdateMetrics(postFile, timeOffset, testMode = false) {
  const postData = JSON.parse(fs.readFileSync(postFile, 'utf-8'));

  if (!postData.post_id && !testMode) {
    console.log(`[Fetcher] post_id未設定: ${postFile}`);
    return;
  }

  let metrics;
  if (testMode) {
    metrics = getDummyMetrics(postData.platform, timeOffset);
  } else if (postData.platform === 'X') {
    metrics = await fetchXMetrics(postData.post_id);
  } else if (postData.platform === 'Threads') {
    metrics = await fetchThreadsMetrics(postData.post_id);
  }

  if (!metrics) return;

  const fieldName = `metrics_${timeOffset}`;
  postData[fieldName] = {
    ...metrics,
    fetched_at: new Date().toISOString(),
  };

  fs.writeFileSync(postFile, JSON.stringify(postData, null, 2));
  console.log(`[Fetcher] ${postData.platform} ${timeOffset}: imp=${metrics.impressions}, likes=${metrics.likes}`);

  // メトリクスをmetrics/に集約保存
  await saveToMetrics(postData);
}

/**
 * metrics/フォルダに集約保存
 */
async function saveToMetrics(postData) {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }

  const date = postData.posted_at?.split('T')[0] || new Date().toISOString().split('T')[0];
  const metricsFile = path.join(METRICS_DIR, `${date}.json`);

  let existing = [];
  if (fs.existsSync(metricsFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
    } catch {}
  }

  const idx = existing.findIndex(m => m.post_id === postData.post_id);
  if (idx !== -1) {
    existing[idx] = postData;
  } else {
    existing.push(postData);
  }

  fs.writeFileSync(metricsFile, JSON.stringify(existing, null, 2));
}

/**
 * 本日の投稿を全件取得
 */
function getTodayPostFiles() {
  const today = new Date().toISOString().split('T')[0];
  const dateDir = path.join(POSTS_DIR, today);

  if (!fs.existsSync(dateDir)) return [];
  return fs.readdirSync(dateDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dateDir, f));
}

/**
 * 全日付の投稿ファイルを取得（24hチェック用）
 */
function getYesterdayPostFiles() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const dateDir = path.join(POSTS_DIR, yesterday);

  if (!fs.existsSync(dateDir)) return [];
  return fs.readdirSync(dateDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dateDir, f));
}

/**
 * メイン処理
 * timeOffset: '1h' | '6h' | '24h'
 */
async function main(timeOffset = '1h', testMode = false) {
  console.log(`[Fetcher] 起動 - ${timeOffset} チェック (テストモード: ${testMode})`);

  let postFiles = [];
  if (timeOffset === '24h') {
    postFiles = [...getTodayPostFiles(), ...getYesterdayPostFiles()];
  } else {
    postFiles = getTodayPostFiles();
  }

  if (postFiles.length === 0) {
    console.log('[Fetcher] 対象投稿なし');
    return;
  }

  console.log(`[Fetcher] ${postFiles.length}件のメトリクスを取得中...`);

  for (const postFile of postFiles) {
    await fetchAndUpdateMetrics(postFile, timeOffset, testMode);
  }

  console.log(`[Fetcher] 完了`);
}

if (require.main === module) {
  const testMode = process.argv.includes('--test');
  const timeOffset = process.argv.find(a => ['1h', '6h', '24h'].includes(a)) || '1h';
  main(timeOffset, testMode).catch(console.error);
}

module.exports = { main };
