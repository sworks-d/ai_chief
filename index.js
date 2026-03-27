/**
 * メインエントリーポイント
 * cronスケジューラー + 承認UIサーバー同時起動
 *
 * 起動方法：node index.js
 */

require('dotenv').config();
const cron = require('node-cron');
const path = require('path');

// 各エージェントのインポート
const researcher = require('./agents/researcher');
const factChecker = require('./agents/fact_checker');
const writer = require('./agents/writer');
const poster = require('./agents/poster');
const fetcher = require('./agents/fetcher');
const analyst = require('./agents/analyst');

console.log('========================================');
console.log(' S-Project: AIエージェントSNS自動発信システム');
console.log('========================================');

// 承認UIサーバーも同時起動
require('./server');

/**
 * エラーハンドリング付き実行
 */
async function runAgent(name, fn) {
  try {
    console.log(`\n[Scheduler] ${name} 開始`);
    await fn();
    console.log(`[Scheduler] ${name} 完了`);
  } catch (error) {
    console.error(`[Scheduler] ${name} エラー:`, error.message);
    // エラーが出ても止まらず続行（CLAUDE.mdのルール4）
  }
}

// ============================
// cronスケジュール設定
// ============================

/**
 * 毎朝5:00 - リサーチャー（MICRO層）
 * 毎日収集
 */
cron.schedule('0 5 * * *', async () => {
  await runAgent('リサーチャー(MICRO)', () => researcher.main(false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 月水金 深夜0:00 - リサーチャー（MIDDLE層）
 * 曜日判定はresearcher.js内で処理
 */
cron.schedule('0 0 * * 1,3,5', async () => {
  await runAgent('リサーチャー(MIDDLE)', () => researcher.main(false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 日曜 深夜0:00 - リサーチャー（MACRO層）
 * 曜日判定はresearcher.js内で処理
 */
cron.schedule('0 0 * * 0', async () => {
  await runAgent('リサーチャー(MACRO)', () => researcher.main(false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 毎朝6:30 - ファクトチェッカー
 */
cron.schedule('30 6 * * *', async () => {
  await runAgent('ファクトチェッカー', () => factChecker.main(false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 毎朝6:45 - ライター
 */
cron.schedule('45 6 * * *', async () => {
  await runAgent('ライター', () => writer.main(false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 朝7:30 - ポスター（朝枠）
 * ※Sが承認UIで承認してから動くため、承認後に手動起動or7:30以降に自動確認
 */
cron.schedule('30 7 * * *', async () => {
  await runAgent('ポスター(朝枠)', () => poster.main(false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 昼13:00 - ポスター（昼枠）X用
 */
cron.schedule('0 13 * * *', async () => {
  await runAgent('ポスター(昼枠)', () => poster.main(false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 夜21:00 - ポスター（夜枠）
 */
cron.schedule('0 21 * * *', async () => {
  await runAgent('ポスター(夜枠)', () => poster.main(false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 1時間ごと - フェッチャー（投稿後1h計測）
 * 実際の運用では投稿時刻から1hを計算するが、簡略化のため1時間毎に全チェック
 */
cron.schedule('5 * * * *', async () => {
  await runAgent('フェッチャー(1h)', () => fetcher.main('1h', false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 6時間ごと - フェッチャー（投稿後6h計測）
 */
cron.schedule('10 */6 * * *', async () => {
  await runAgent('フェッチャー(6h)', () => fetcher.main('6h', false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 毎日3:00 - フェッチャー（投稿後24h計測）
 */
cron.schedule('0 3 * * *', async () => {
  await runAgent('フェッチャー(24h)', () => fetcher.main('24h', false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 毎日深夜1:00 - アナリスト（日次分析）
 */
cron.schedule('0 1 * * *', async () => {
  await runAgent('アナリスト(日次)', () => analyst.main('daily', false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 毎週月曜朝6:00 - アナリスト（週次分析）
 */
cron.schedule('0 6 * * 1', async () => {
  await runAgent('アナリスト(週次)', () => analyst.main('weekly', false));
}, { timezone: 'Asia/Tokyo' });

/**
 * 毎月1日3:00 - アナリスト（月次分析・ペルソナ更新）
 */
cron.schedule('0 3 1 * *', async () => {
  await runAgent('アナリスト(月次)', () => analyst.main('monthly', false));
}, { timezone: 'Asia/Tokyo' });

console.log('\n[Scheduler] cronスケジュール設定完了');
console.log('スケジュール一覧:');
console.log('  05:00 - リサーチャー(MICRO毎日)');
console.log('  00:00 - リサーチャー(MIDDLE月水金 / MACRO日)');
console.log('  06:30 - ファクトチェッカー');
console.log('  06:45 - ライター');
console.log('  07:30 - ポスター(朝枠・X)');
console.log('  13:00 - ポスター(昼枠・X)');
console.log('  21:00 - ポスター(夜枠・X)');
console.log('  毎時+5分 - フェッチャー(1h)');
console.log('  6時間毎+10分 - フェッチャー(6h)');
console.log('  03:00 - フェッチャー(24h)');
console.log('  01:00 - アナリスト(日次)');
console.log('  月曜06:00 - アナリスト(週次)');
console.log('  毎月1日03:00 - アナリスト(月次)');
console.log('\n承認UI: http://localhost:3001');
console.log('システム起動中...\n');
