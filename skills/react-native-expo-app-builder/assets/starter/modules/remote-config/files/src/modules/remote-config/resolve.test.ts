import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readBoolean } from './resolve';

test('fallbacks apply until a real boolean arrives', () => {
  assert.equal(readBoolean(undefined, 'ask.enabled', true), true);
  assert.equal(readBoolean({ 'ask.enabled': 'false' }, 'ask.enabled', true), true, 'a string is not a boolean');
  assert.equal(readBoolean({ 'ask.enabled': false }, 'ask.enabled', true), false);
});

test('unknown keys keep the fallback', () => {
  assert.equal(readBoolean({ other: true }, 'ask.enabled', false), false);
});
