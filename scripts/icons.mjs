// Renders PNG icons + splash from icon.svg using Playwright (dev helper).
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const svg = await readFile(new URL('../www/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(size, out, bg) {
  await page.setViewportSize({ width: size, height: size });
  const inner = bg ? `<div style="width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center"><div style="width:${size * 0.28}px;height:${size * 0.28}px">${svg}</div></div>` : svg;
  await page.setContent(`<html><body style="margin:0">${inner}<style>svg{width:100%;height:100%;display:block}</style></body></html>`);
  await writeFile(out, await page.screenshot({ omitBackground: !bg }));
}
await mkdir(new URL('../resources/', import.meta.url), { recursive: true });
await shot(192, new URL('../www/icons/icon-192.png', import.meta.url));
await shot(512, new URL('../www/icons/icon-512.png', import.meta.url));
await shot(1024, new URL('../resources/icon.png', import.meta.url));
await shot(2732, new URL('../resources/splash.png', import.meta.url), '#0c1018');
await browser.close();
console.log('icons written');
