import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compactBody } from './body';

test('compactBody drops undefined and null values', () => {
  assert.deepEqual(compactBody({ a: 1, b: undefined, c: null, d: false, e: '' }), { a: 1, d: false, e: '' });
});

test('compactBody keeps null only for documented nullable fields', () => {
  assert.deepEqual(compactBody({ reminderTime: null, iconKey: null, name: null }, ['reminderTime', 'iconKey']), { reminderTime: null, iconKey: null });
  assert.deepEqual(compactBody({ dailyTipEnabled: null, habitRemindersEnabled: true }), { habitRemindersEnabled: true });
});
