const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const baseStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700;900&display=swap');
  body {
    margin: 0; padding: 0; width: 1080px; height: 1080px;
    background-color: #fcfcfc;
    /* エクセルのような薄い方眼紙背景 */
    background-image: linear-gradient(#f0f0f0 1px, transparent 1px), linear-gradient(90deg, #f0f0f0 1px, transparent 1px);
    background-size: 20px 20px;
    font-family: 'Noto Sans JP', sans-serif;
    color: #111; display: flex; flex-direction: column; align-items: center;
    box-sizing: border-box; padding: 40px;
  }
  .header { text-align: left; margin-bottom: 20px; width: 100%; border-bottom: 4px solid #111; padding-bottom: 10px; }
  .badge { background: #111; color: #fff; font-weight: 900; padding: 6px 14px; font-size: 20px; display: inline-block; margin-bottom: 15px; border-radius: 0; }
  .title { font-size: 50px; font-weight: 900; letter-spacing: 1px; margin: 0 0 10px 0; line-height: 1.2; text-shadow: 1px 1px 0px #fff; }
  .subtitle { font-size: 22px; color: #333; line-height: 1.5; font-weight: 700; background: #ffffaa; display: inline; padding: 2px 4px; border: 1px solid #111; }
  /* シャドウや角丸を徹底排除 */
  * { border-radius: 0 !important; box-shadow: none !important; }
`;

const autoResizeScript = `
  <script>
    function autoResize(selector, minSize) {
      document.querySelectorAll(selector).forEach(el => {
        let size = parseInt(window.getComputedStyle(el).fontSize);
        while (el.scrollHeight > el.clientHeight && size > minSize) {
          size -= 0.5;
          el.style.fontSize = size + 'px';
        }
      });
    }
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        autoResize('.item-desc', 12);
        autoResize('.step-desc', 12);
        autoResize('.a-text', 14);
      }, 50);
    });
  </script>
`;

function generateGridHTML(data) {
  const itemsHtml = data.items.map((item) => `
    <div class="grid-item">
      <div class="item-title">
        ${item.icon_text ? `<span class="icon-label">【${item.icon_text.replace(/\n/g, '')}】</span> ` : ''}${item.title}
      </div>
      ${item.before && item.after ? `
        <div class="comparison">
          <div class="before">× ${item.before}</div>
          <div class="arrow">↓</div>
          <div class="after">○ ${item.after}</div>
        </div>
      ` : ''}
      <div class="item-desc">${item.desc}</div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <style>
        ${baseStyles}
        .header .badge { background: #003366; } /* ビジネスネイビー */
        .grid-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; width: 100%; height: 780px; }
        .grid-item { background: #fff; padding: 0; position: relative; display: flex; flex-direction: column; overflow: hidden; border: 3px solid #111; }
        .icon-label { color: #cc0000; font-weight: 900; }
        .item-title { font-size: 24px; font-weight: 900; background: #f0f0f0; border-bottom: 2px solid #111; padding: 10px 15px; display: flex; align-items: center; justify-content: flex-start; }
        .comparison { border-bottom: 1px dashed #999; width: 100%; background: #fafafa; padding: 10px 15px; box-sizing: border-box; }
        .before { font-size: 20px; color: #555; text-decoration: line-through; }
        .arrow { font-weight: 900; font-size: 20px; margin: 2px 0; color: #111; }
        .after { font-size: 24px; font-weight: 900; color: #cc0000; line-height: 1.2; }
        .item-desc { font-size: 18px; font-weight: 700; color: #222; line-height: 1.6; text-align: left; padding: 15px; flex: 1; overflow: hidden; display: block; width: 100%; box-sizing: border-box; }
        /* itemsが多い時は3列にするなどの動的対応も可能ですが、一旦2列の高密度レイアウトとします */
      </style>
    </head>
    <body>
      <div class="header">
        <div class="badge">【零細AI推進課長】比較・一覧</div>
        <h1 class="title">${data.title}</h1>
        ${data.subtitle ? `<div class="subtitle">${data.subtitle}</div>` : ''}
      </div>
      <div class="grid-container" style="${data.items.length > 4 ? 'grid-template-columns: repeat(3, 1fr);' : ''}">${itemsHtml}</div>
      ${autoResizeScript}
    </body>
    </html>
  `;
}

function generateStepHTML(data) {
  const isMany = data.items.length > 5;
  const padding = isMany ? '15px 20px' : '20px 25px';

  const itemsHtml = data.items.map((item, i) => `
    <div class="step-item" style="padding: ${padding}">
      <div class="step-num">STEP 0${i + 1}</div>
      <div class="step-content">
        <div class="step-title">${item.title}</div>
        <div class="step-desc">${item.desc}</div>
      </div>
    </div>
    ${i < data.items.length - 1 ? '<div class="step-arrow">▼</div>' : ''}
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <style>
        ${baseStyles}
        .header .badge { background: #004d00; } /* ダークグリーン */
        .step-container { display: flex; flex-direction: column; width: 100%; padding: 0 40px; height: 750px; overflow: hidden; }
        .step-item { background: #fff; display: flex; align-items: center; border: 3px solid #111; }
        .step-num { font-size: 28px; font-weight: 900; color: #fff; background: #111; padding: 10px 15px; margin-right: 20px; text-align: center; }
        .step-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .step-title { font-weight: 900; font-size: 26px; color: #111; margin-bottom: 2px; }
        .step-desc { font-size: 18px; font-weight: 700; color: #333; line-height: 1.5; max-height: 80px; overflow: hidden; }
        .step-arrow { text-align: center; font-size: 30px; line-height: 1; color: #111; margin: 5px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="badge">【零細AI推進課長】手順書</div>
        <h1 class="title">${data.title}</h1>
        ${data.subtitle ? `<div class="subtitle">${data.subtitle}</div>` : ''}
      </div>
      <div class="step-container">${itemsHtml}</div>
      ${autoResizeScript}
    </body>
    </html>
  `;
}

function generateQAHTML(data) {
  const itemsHtml = data.items.map(item => `
    <div class="qa-item">
      <div class="q-row">
        <span class="q-icon">Q.</span>
        <div class="q-text">${item.title}</div>
      </div>
      <div class="a-row">
        <span class="a-icon">A.</span>
        <div class="a-text">${item.desc}</div>
      </div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <style>
        ${baseStyles}
        .header .badge { background: #990000; } /* ディープレッド */
        .qa-container { display: flex; flex-direction: column; gap: 20px; width: 100%; height: 780px; overflow: hidden; }
        .qa-item { background: #fff; border: 3px solid #111; display: flex; flex-direction: column; }
        .q-row { display: flex; align-items: flex-start; padding: 15px 20px; border-bottom: 2px dotted #111; background: #f9f9f9; }
        .q-icon { font-size: 36px; font-weight: 900; color: #111; margin-right: 15px; margin-top: -5px; }
        .q-text { font-size: 26px; font-weight: 900; color: #111; line-height: 1.4; }
        .a-row { display: flex; align-items: flex-start; padding: 20px 20px; background: #fff; }
        .a-icon { font-size: 36px; font-weight: 900; color: #cc0000; margin-right: 15px; margin-top: -5px; }
        .a-text { font-size: 22px; font-weight: 700; color: #222; line-height: 1.6; flex: 1; height: auto; max-height: 150px; overflow: hidden; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="badge">【零細AI推進課長】見解・Q&A</div>
        <h1 class="title">${data.title}</h1>
        ${data.subtitle ? `<div class="subtitle">${data.subtitle}</div>` : ''}
      </div>
      <div class="qa-container">${itemsHtml}</div>
      ${autoResizeScript}
    </body>
    </html>
  `;
}

async function generateCheatSheet(data, outputPath, providedBrowser = null) {
  let browser = providedBrowser;
  let shouldClose = false;

  if (!browser) {
    browser = await puppeteer.launch({
      defaultViewport: { width: 1080, height: 1080, deviceScaleFactor: 2 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 60000
    });
    shouldClose = true;
  }

  try {
    const page = await browser.newPage();
    let html = '';
    const theme = data.theme || 'grid';
    
    if (theme === 'step') {
      html = generateStepHTML(data);
    } else if (theme === 'qa') {
      html = generateQAHTML(data);
    } else {
      html = generateGridHTML(data);
    }
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // フォントの読み込みとautoResizeの完了を待機
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(resolve => setTimeout(resolve, 200)); 
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await page.screenshot({ path: outputPath });
    console.log(`[ImageGenerator] 画像生成完了(theme:${theme}): ${outputPath}`);
    await page.close(); // 使い回す場合のためにpage自体は閉じる
    return true;
  } catch (err) {
    console.error(`[ImageGenerator] 画像生成エラー:`, err);
    return false;
  } finally {
    if (shouldClose) {
      await browser.close();
    }
  }
}

// 直接テスト実行用
if (require.main === module) {
  const sampleData1 = {
    title: "ココに気をつけようプロンプト術", subtitle: "AIへの指示出しの基本です", theme: "grid",
    items: [ { icon_text: "形式", title: "出力指定", before: "よろしく", after: "表にして", desc: "Markdownの表にしてなど形式指定をして。" }, { icon_text: "文脈", title: "前提", desc: "あなたは〇〇ですと役割を与える" } ]
  };
  const sampleData2 = {
    title: "AI導入の3ステップ", subtitle: "小さな会社がAIを入れる時の正しい壁の超え方", theme: "step",
    items: [ { title: "まずは個人で触る", desc: "ChatGPT PlusやGemini Advancedを社員個人が使い倒す。" }, { title: "業務を切り出す", desc: "議事録やリサーチなど具体的なタスクをAIに任せる。" }, { title: "チーム全体で共有", desc: "成功例を共有し、プロンプトを社内の資産にする。" } ]
  };
  const sampleData3 = {
    title: "よくあるAI導入の誤解", subtitle: "経営層が勘違いしがちなAIの真実", theme: "qa",
    items: [ { title: "AIを入れたら人間はいらなくなる？", desc: "いいえ、AIは指示を出す人間以上の成果は出せません。人間のスキルがレバレッジされるツールです。" }, { title: "機密情報はどうなるの？", desc: "APIを使用したりエンタープライズ版を利用すれば学習データには利用されません。" } ]
  };

  (async () => {
    await generateCheatSheet(sampleData1, path.join(__dirname, '..', 'data', 'media', 'test_grid.png'));
    await generateCheatSheet(sampleData2, path.join(__dirname, '..', 'data', 'media', 'test_step.png'));
    await generateCheatSheet(sampleData3, path.join(__dirname, '..', 'data', 'media', 'test_qa.png'));
  })();
}

module.exports = { generateCheatSheet };
