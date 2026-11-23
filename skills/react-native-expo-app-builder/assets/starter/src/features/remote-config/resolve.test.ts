import assert from 'node:assert/strict';
import { test } from 'node:test';

import { flagsFrom, readBoolean } from './resolve';

test('fallbacks apply until a real boolean arrives', () => {
  assert.deepEqual(flagsFrom(undefined), { askEnabled: true });
  assert.deepEqual(flagsFrom({ 'ask.enabled': 'false' }), { askEnabled: true }, 'a string is not a boolean');
  assert.deepEqual(flagsFrom({ 'ask.enabled': false }), { askEnabled: false });
});

test('readBoolean ignores unknown keys', () => {
  assert.equal(readBoolean({ other: true }, 'ask.enabled', false), false);
});
