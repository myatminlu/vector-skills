import assert from 'node:assert/strict';
import { test } from 'node:test';

import { burmese, toBurmeseDigits } from './language';
import { myanmarScript } from './script';

test('Burmese digits and counts', () => {
  assert.equal(toBurmeseDigits('12 / 4'), '၁၂ / ၄');
  assert.equal(burmese.formatCount?.(1200), '၁,၂၀၀');
});

test('every spelling of the language code means Burmese', () => {
  for (const tag of ['my', 'my-mm', 'my_mm', 'mm']) assert.ok(burmese.matches(tag), tag);
  assert.ok(!burmese.matches('ms'));
});

test('Myanmar text gets the tall line box; Latin text is left alone', () => {
  assert.ok(myanmarScript.test('မြန်မာစာ'));
  assert.ok(!myanmarScript.test('English'));
  assert.equal(myanmarScript.lineHeight(16), 35);
});
