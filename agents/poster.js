/**
 * エージェント4：ポスター
 * 役割：SがOKを押した投稿を時間帯バラして自動投稿する
 * 実行タイミング：承認後・cronで実行（7:00-8:00 / 12:00-13:00 / 21:00-22:00）
 */

require('dotenv').config();
const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

const TODAY = new Date().toISOString().split('T')[0];
const QUEUE_DIR = path.join(__dirname, '..', 'data', 'queue');
const POSTS_DIR = path.join(__dirname, '..', 'data', 'posts');
const QUEUE_FILE = path.join(QUEUE_DIR, `${TODAY}.json`);

// 投稿スロット定義（時間帯）
const POST_SLOTS = {
  morning: { hour: 7, minute: 30 },   // 朝7:30
  noon: { hour: 12, minute: 15 },     // 昼12:15
  evening: { hour: 21, minute: 0 },   // 夜21:00
};

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
 * X（旧Twitter）に投稿
 */
async function postToX(text, replyToId = null) {
  const client = getXClient();
  const rwClient = client.readWrite;

  try {
    const params = replyToId
      ? { text, reply: { in_reply_to_tweet_id: replyToId } }
      : text;
    const response = replyToId
      ? await rwClient.v2.tweet(params)
      : await rwClient.v2.tweet(text);
    return {
      success: true,
      post_id: response.data.id,
      url: `https://twitter.com/i/web/status/${response.data.id}`,
    };
  } catch (error) {
    console.error('[Poster] X投稿エラー:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Threads APIに投稿
 * Threads Graph API v1.0
 */
async function postToThreads(text) {
  const userId = process.env.THREADS_USER_ID;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;

  if (!userId || !accessToken) {
    return { success: false, error: 'Threads APIキーが未設定' };
  }

  try {
    // Step 1: メディアコンテナ作成
    const containerRes = await axios.post(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      null,
      {
        params: {
          media_type: 'TEXT',
          text: text,
          access_token: accessToken,
        },
      }
    );

    const containerId = containerRes.data.id;

    // Step 2: 3秒待機（API要件）
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: 投稿実行
    const publishRes = await axios.post(
      `https://graph.threads.net/v1.0/${userId}/threads_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: accessToken,
        },
      }
    );

    return {
      success: true,
      post_id: publishRes.data.id,
      url: `https://www.threads.net/post/${publishRes.data.id}`,
    };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('[Poster] Threads投稿エラー:', errMsg);
    return { success: false, error: errMsg };
  }
}

/**
 * 投稿をファイルに記録
 */
function logPost(post, result) {
  if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
  }

  const dateDir = path.join(POSTS_DIR, TODAY);
  if (!fs.existsSync(dateDir)) {
    fs.mkdirSync(dateDir, { recursive: true });
  }

  const logData = {
    post_id: result.post_id || null,
    platform: post.platform,
    content: post.post_text,
    posted_at: new Date().toISOString(),
    post_type: post.post_type,
    theme_tag: post.source_item?.theme_tag || null,
    layer: post.source_item?.layer || null,
    character_tag: post.character_tag || null,
    url: result.url || null,
    metrics_1h: null,
    metrics_6h: null,
    metrics_24h: null,
  };

  const logFile = path.join(dateDir, `${post.id}.json`);
  fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));

  return logData;
}

/**
 * キューからapprovedの投稿を取得
 */
function getApprovedPosts() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
  return queue.filter(p => p.status === 'approved');
}

/**
 * キューの投稿ステータスを更新
 */
function updateQueueStatus(postId, status, postResult = null) {
  if (!fs.existsSync(QUEUE_FILE)) return;
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));

  const idx = queue.findIndex(p => p.id === postId);
  if (idx !== -1) {
    queue[idx].status = status;
    queue[idx].posted_at = new Date().toISOString();
    if (postResult) {
      queue[idx].platform_post_id = postResult.post_id;
      queue[idx].platform_url = postResult.url;
    }
  }

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

/**
 * Threadsが有効か確認
 */
function isThreadsEnabled() {
  return !!(process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN);
}

/**
 * 現在の時間帯に投稿すべきプラットフォームを決定
 */
function getPlatformForCurrentSlot() {
  const hour = new Date().getHours();
  const threads = isThreadsEnabled();

  if (hour >= 7 && hour < 9) return ['X'];
  if (hour >= 12 && hour < 14) return threads ? ['Threads'] : ['X'];
  if (hour >= 21 && hour < 23) return threads ? ['X', 'Threads'] : ['X'];
  return threads ? ['X', 'Threads'] : ['X'];
}

/**
 * リトライ付き投稿
 */
async function postWithRetry(post, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Poster] 投稿中 (試行${attempt}/${maxRetries}): ${post.platform} - ${post.post_text.slice(0, 30)}...`);

    let result;
    if (post.platform === 'X') {
      result = await postToX(post.post_text);
    } else if (post.platform === 'Threads') {
      result = await postToThreads(post.post_text);
    } else {
      result = { success: false, error: '不明なプラットフォーム' };
    }

    if (result.success) {
      console.log(`[Poster] 投稿成功: ${result.url}`);
      return result;
    }

    if (attempt < maxRetries) {
      console.log(`[Poster] 30分後にリトライします...`);
      await new Promise(resolve => setTimeout(resolve, 30 * 60 * 1000));
    }
  }

  return { success: false, error: '最大リトライ回数に達しました' };
}

/**
 * メイン処理
 */
async function main(testMode = false, forceMode = false) {
  console.log(`[Poster] 起動 - ${TODAY}`);

  const approvedPosts = getApprovedPosts();
  console.log(`[Poster] 承認済み投稿: ${approvedPosts.length}件`);

  if (approvedPosts.length === 0) {
    console.log('[Poster] 投稿する内容がありません');
    return;
  }

  // Threads未設定の場合はスキップログ
  if (!isThreadsEnabled()) {
    console.log('[Poster] Threads未設定のためスキップ（THREADS_ACCESS_TOKENが.envに未設定）');
  }

  // 時間帯に合わせたプラットフォームフィルタ（--forceで無効化）
  const targetPlatforms = forceMode
    ? (isThreadsEnabled() ? ['X', 'Threads'] : ['X'])
    : getPlatformForCurrentSlot();
  if (forceMode) console.log('[Poster] --force: 時間帯フィルタをスキップ');
  const targetPosts = approvedPosts.filter(p => targetPlatforms.includes(p.platform));

  // 1日最大：X3本・Threads2本の制限チェック
  const todayPostDir = path.join(POSTS_DIR, TODAY);
  let postedX = 0, postedThreads = 0;
  if (fs.existsSync(todayPostDir)) {
    const postFiles = fs.readdirSync(todayPostDir);
    postedX = postFiles.filter(f => f.includes('-X-')).length;
    postedThreads = postFiles.filter(f => f.includes('-TH-')).length;
  }

  // スレッドグループを検出・グループ化
  const threadGroups = {};
  const nonThreadPosts = [];
  for (const post of targetPosts) {
    if (post.thread_group) {
      if (!threadGroups[post.thread_group]) threadGroups[post.thread_group] = [];
      threadGroups[post.thread_group].push(post);
    } else {
      nonThreadPosts.push(post);
    }
  }
  // スレッドグループはthread_index順にソート
  for (const gid of Object.keys(threadGroups)) {
    threadGroups[gid].sort((a, b) => a.thread_index - b.thread_index);
  }

  // スレッドグループ投稿（X thread）
  for (const [groupId, posts] of Object.entries(threadGroups)) {
    if (postedX >= 3) { console.log('[Poster] X投稿上限（3本/日）に達しました'); break; }
    console.log(`[Poster] スレッド投稿開始: ${groupId} (${posts.length}投稿)`);
    let prevTweetId = null;

    for (const post of posts) {
      if (testMode) {
        const fakeId = `test_${Date.now()}`;
        console.log(`[Poster][TEST] X thread[${post.thread_index}]:\n${post.post_text}\n`);
        updateQueueStatus(post.id, 'posted', { post_id: fakeId, url: 'https://test.example.com' });
        logPost(post, { post_id: fakeId, url: 'https://test.example.com', success: true });
        prevTweetId = fakeId;
        continue;
      }
      try {
        const client = getXClient();
        const params = prevTweetId
          ? { text: post.post_text, reply: { in_reply_to_tweet_id: prevTweetId } }
          : post.post_text;
        const response = prevTweetId
          ? await client.readWrite.v2.tweet(params)
          : await client.readWrite.v2.tweet(post.post_text);
        const result = { success: true, post_id: response.data.id, url: `https://twitter.com/i/web/status/${response.data.id}` };
        updateQueueStatus(post.id, 'posted', result);
        logPost(post, result);
        prevTweetId = response.data.id;
        console.log(`[Poster] スレッド[${post.thread_index}]投稿成功: ${result.url}`);
        await new Promise(r => setTimeout(r, 2000)); // 2秒待機
      } catch (err) {
        console.error(`[Poster] スレッド[${post.thread_index}]投稿エラー:`, err.message);
        updateQueueStatus(post.id, 'failed');
        break; // スレッドが途切れたら中断
      }
    }
    postedX++;
  }

  for (const post of nonThreadPosts) {
    // 上限チェック
    if (post.platform === 'X' && postedX >= 3) {
      console.log('[Poster] X投稿上限（3本/日）に達しました');
      continue;
    }
    if (post.platform === 'Threads' && postedThreads >= 2) {
      console.log('[Poster] Threads投稿上限（2本/日）に達しました');
      continue;
    }

    if (testMode) {
      console.log(`[Poster][TEST] ${post.platform}に投稿予定:\n${post.post_text}\n`);
      updateQueueStatus(post.id, 'posted', { post_id: `test_${Date.now()}`, url: 'https://test.example.com' });
      logPost(post, { post_id: `test_${Date.now()}`, url: 'https://test.example.com', success: true });
      if (post.platform === 'X') postedX++;
      else postedThreads++;
      continue;
    }

    // 実際の投稿
    const result = await postWithRetry(post);

    if (result.success) {
      updateQueueStatus(post.id, 'posted', result);
      logPost(post, result);
      if (post.platform === 'X') postedX++;
      else postedThreads++;
    } else {
      console.error(`[Poster] 投稿失敗: ${result.error}`);
      updateQueueStatus(post.id, 'failed');
    }
  }

  console.log(`[Poster] 完了 - X:${postedX}本 / Threads:${postedThreads}本 投稿済み`);
}

/**
 * 単一投稿を即時投稿（承認UI「今すぐ投稿」用）
 */
async function postSingle(postId) {
  const today = new Date().toISOString().split('T')[0];
  const queueFile = path.join(QUEUE_DIR, `${today}.json`);
  if (!fs.existsSync(queueFile)) {
    return { success: false, error: 'キューファイルが見つかりません' };
  }

  const queue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
  const post = queue.find(p => p.id === postId);
  if (!post) return { success: false, error: '投稿が見つかりません' };
  if (post.platform !== 'X') return { success: false, error: 'Threads即時投稿は未対応' };

  console.log(`[Poster] 即時投稿: ${post.post_text.slice(0, 40)}...`);
  const result = await postToX(post.post_text);

  if (result.success) {
    updateQueueStatus(postId, 'posted', result);
    logPost(post, result);
    console.log(`[Poster] 即時投稿成功: ${result.url}`);
  } else {
    updateQueueStatus(postId, 'failed');
    console.error(`[Poster] 即時投稿失敗: ${result.error}`);
  }

  return result;
}

if (require.main === module) {
  const testMode = process.argv.includes('--test');
  const forceMode = process.argv.includes('--force');
  main(testMode, forceMode).catch(console.error);
}

module.exports = { main, postSingle };
