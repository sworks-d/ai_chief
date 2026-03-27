/**
 * ngrokのURLを取得してGmailに送信する
 * 実行タイミング：毎朝8:00・9:30（index.jsのcronから呼ばれる）
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const nodemailer = require('nodemailer');
const http = require('http');

/**
 * ngrok APIからトンネルURLを取得
 */
function getNgrokUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const tunnel = parsed.tunnels.find(t => t.proto === 'https');
          if (tunnel) {
            resolve(tunnel.public_url);
          } else {
            reject(new Error('httpsトンネルが見つかりません'));
          }
        } catch (e) {
          reject(new Error('ngrok APIのパース失敗: ' + e.message));
        }
      });
    });
    req.on('error', (e) => {
      reject(new Error('ngrokが起動していません: ' + e.message));
    });
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('ngrok API タイムアウト'));
    });
  });
}

/**
 * GmailでURLを送信
 */
async function sendEmail(ngrokUrl) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to   = process.env.NOTIFY_EMAIL;

  if (!user || !pass) {
    console.log('[Notify] GMAIL_USER または GMAIL_APP_PASSWORD が未設定 → スキップ');
    return;
  }

  const now = new Date();
  const hhmm = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  const mailOptions = {
    from: user,
    to: to || user,
    subject: `余白のAI — 今日のアクセスURL (${hhmm})`,
    text: `今日の承認UIのURLです。\n\n${ngrokUrl}\n\nスマホのブラウザで開いてください。`,
  };

  await transporter.sendMail(mailOptions);
  console.log(`[Notify] メール送信完了 → ${to || user} : ${ngrokUrl}`);
}

/**
 * メイン処理
 */
async function main() {
  console.log('[Notify] ngrok URL取得中...');
  try {
    const url = await getNgrokUrl();
    console.log('[Notify] URL取得成功:', url);
    await sendEmail(url);
  } catch (e) {
    console.error('[Notify] エラー:', e.message);
  }
}

// 直接実行時はそのまま実行、cronからのrequireはmainをエクスポート
if (require.main === module) {
  main();
}

module.exports = main;
