'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('UI never blurs what sits behind a window', () => {
  const ui = path.join(__dirname, '..', 'ui');
  for (const file of fs.readdirSync(ui).filter(name => /\.(css|html|m?js)$/.test(name))) {
    assert.doesNotMatch(fs.readFileSync(path.join(ui, file), 'utf8'), /blur\(|backdrop-filter|backdropFilter/, `${file} uses a blur effect`);
  }
});
