// Renders the studio's public/icon.svg to build/icon.png (512×512) with Playwright's Chromium,
// so the desktop icon always matches the web app's. electron-builder derives the .ico from it.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(path.resolve(root, '../test-authoring-studio/public/icon.svg'), 'utf8');
mkdirSync(path.join(root, 'build'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/<svg/, '<svg width="512" height="512"')}</body></html>`);
await page.screenshot({ path: path.join(root, 'build/icon.png'), omitBackground: true });
await browser.close();
console.log('build/icon.png written');
