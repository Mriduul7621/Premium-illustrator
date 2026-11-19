import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

test('landing background: bundled from the repo, no external raw.githubusercontent dependency', () => {
  const css = read('src/index.css');
  const calculator = read('src/components/Calculator.tsx');
  assert.ok(!css.includes('raw.githubusercontent'), 'index.css must not reference raw.githubusercontent');
  assert.ok(!css.includes('mriduultnd'), 'index.css must not reference the old mriduultnd repo');
  assert.ok(!calculator.includes('raw.githubusercontent'), 'Calculator.tsx must not reference raw.githubusercontent');
  assert.ok(
    css.includes('background-image: var(--home-bg-desktop)'),
    'desktop watermark must use the bundled desktop artwork variable',
  );
  assert.ok(
    css.includes('background-image: var(--home-bg-mobile)'),
    'mobile watermark must use the bundled mobile artwork variable',
  );
  assert.ok(
    calculator.includes("from '../../Premium Pulse Laptop BG.jpg'"),
    'Calculator must import the bundled laptop artwork',
  );
  assert.ok(
    calculator.includes("from '../../Premium Pulse Mobile App BG.jpg'"),
    'Calculator must import the bundled mobile artwork',
  );
  assert.ok(existsSync(path.join(root, 'Premium Pulse Laptop BG.jpg')), 'laptop artwork must exist in the repo');
  assert.ok(existsSync(path.join(root, 'Premium Pulse Mobile App BG.jpg')), 'mobile artwork must exist in the repo');
});

test('service worker: no external artwork, v4 cache, new icon in the app shell', () => {
  const sw = read('public/sw.js');
  assert.ok(!sw.includes('raw.githubusercontent'), 'sw.js must not reference raw.githubusercontent');
  assert.ok(!sw.includes('EXTERNAL_ARTWORK'), 'sw.js must not keep the external artwork list');
  assert.ok(sw.includes("premium-pulse-offline-v4"), 'sw.js cache must be bumped to v4');
  assert.ok(sw.includes("'/icon.svg'"), 'app shell must precache the new SVG icon');
  assert.ok(!sw.includes('premium-pulse-app-icon.png'), 'app shell must not precache the retired 11.6 MB icon');
});

test('index.html: SVG favicon first, PNG fallbacks, Apple touch icon, brand theme colour', () => {
  const html = read('index.html');
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/icon.svg" />'), 'SVG favicon link missing');
  assert.ok(html.includes('href="/icons/favicon-32.png"'), '32px PNG favicon fallback missing');
  assert.ok(html.includes('href="/icons/favicon-48.png"'), '48px PNG favicon fallback missing');
  assert.ok(html.includes('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />'), 'Apple touch icon missing');
  assert.ok(html.includes('<meta name="theme-color" content="#978c21" />'), 'theme colour must stay olive #978c21');
  assert.ok(!html.includes('premium-pulse-app-icon.png'), 'index.html must not reference the retired icon');
});

// NOTE: the PNG icon files themselves are uploaded to public/icons/ by Mahadi via the
// GitHub web UI (the connector pushes text only), so this test guards the references,
// not the files — it stays green both before and after that upload.
test('manifest: SVG + 192/512 + maskable icons, PremiumPulse identity intact', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
    name: string;
    short_name: string;
    display: string;
    theme_color: string;
    icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  };
  assert.equal(manifest.short_name, 'PremiumPulse');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#978c21');
  const bySrc = new Map(manifest.icons.map(icon => [icon.src, icon]));
  assert.equal(bySrc.get('/icon.svg')?.type, 'image/svg+xml');
  assert.equal(bySrc.get('/icons/icon-192.png')?.sizes, '192x192');
  assert.equal(bySrc.get('/icons/icon-512.png')?.sizes, '512x512');
  assert.equal(bySrc.get('/icons/maskable-512.png')?.purpose, 'maskable');
  assert.ok(!manifest.icons.some(icon => icon.src.includes('premium-pulse-app-icon.png')));
});

test('icon.svg: hand-written SVG master in brand colours, small and self-contained', () => {
  const svgPath = path.join(root, 'public/icon.svg');
  assert.ok(existsSync(svgPath), 'public/icon.svg must exist');
  const svg = read('public/icon.svg');
  assert.ok(svg.includes('<svg'), 'icon.svg must be an SVG document');
  assert.ok(svg.includes('#978C21'), 'icon must use Olive #978C21');
  assert.ok(svg.includes('#F37021'), 'icon must use Sunset Orange #F37021');
  assert.ok(svg.includes('#F7F2E9'), 'icon must use canvas cream #F7F2E9');
  assert.ok(!svg.includes('<image'), 'icon must be pure vector, no embedded raster');
  assert.ok(Buffer.byteLength(svg) < 5 * 1024, 'icon.svg must stay small');
});
