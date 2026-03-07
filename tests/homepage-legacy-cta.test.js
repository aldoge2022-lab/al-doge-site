const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function readPage(fileName) {
  return fs.readFileSync(path.join(repoRoot, fileName), 'utf8');
}

test('index homepage does not promote legacy panini custom flow', () => {
  const indexHtml = readPage('index.html');

  assert.ok(!indexHtml.includes('href="panini-custom.html"'));
  assert.ok(!indexHtml.includes('🥖 Panini Custom AI'));
  assert.ok(!indexHtml.includes('/panini-custom'));
});

test('home homepage variant does not promote legacy panini custom flow', () => {
  const homeHtml = readPage('home.html');

  assert.ok(!homeHtml.includes('href="panini-custom.html"'));
  assert.ok(!homeHtml.includes('<span>PANINI CUSTOM AI</span>'));
  assert.ok(!homeHtml.includes('<h3>Panini AI</h3>'));
  assert.ok(!homeHtml.includes('/panini-custom'));
});
