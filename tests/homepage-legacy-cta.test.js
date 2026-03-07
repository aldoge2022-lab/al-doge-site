const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function readPage(fileName) {
  return fs.readFileSync(path.join(repoRoot, fileName), 'utf8');
}

function assertHomepageGuards(html) {
  assert.ok(!html.includes('href="panini-custom.html"'));
  assert.ok(!html.includes('/panini-custom'));
  assert.ok(!html.includes('P.IVA IT00000000000'));
  assert.ok(!html.includes('info@al-doge.it'));

  assert.ok(html.includes('href="/pizze.html"'));
  assert.ok(html.includes('href="/chatbot.html"'));
  assert.ok(html.includes('href="/carrello.html"'));
  assert.ok(html.includes('Lasciati guidare'));
  assert.ok(html.includes('Esplora il menu'));
  assert.ok(html.includes('id="assistente-v3"'));
}

test('index homepage keeps canonical routes and V3-first CTA strategy', () => {
  const indexHtml = readPage('index.html');
  assertHomepageGuards(indexHtml);
});

test('home homepage variant keeps canonical routes and V3-first CTA strategy', () => {
  const homeHtml = readPage('home.html');
  assertHomepageGuards(homeHtml);
});
