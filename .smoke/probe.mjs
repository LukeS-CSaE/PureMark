import puppeteer from 'puppeteer-core';

const url = 'http://localhost:4174/';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const consoleMsgs = [];
page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });

// Dump initial DOM tree to find the settings trigger
const init = await page.evaluate(() => {
  return {
    bodyText: document.body.innerText.slice(0, 200),
    buttons: [...document.querySelectorAll('button')].slice(0, 20).map(b => ({
      text: (b.textContent || '').slice(0, 40).trim(),
      aria: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
    })),
  };
});
console.log('INIT', JSON.stringify(init, null, 2));

await browser.close();
console.log('CONSOLE', JSON.stringify(consoleMsgs, null, 2));
