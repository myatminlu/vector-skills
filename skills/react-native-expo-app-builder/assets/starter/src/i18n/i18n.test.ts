import assert from 'node:assert/strict';
import { test } from 'node:test';

import { en } from './en';
import { formatCount, localDateKey, toBurmeseDigits } from './format';
import { normalizeLanguage, translate } from './index';
import { my } from './my';

test('every language has every key, and none is empty', () => {
  const enKeys = Object.keys(en).sort();
  assert.deepEqual(Object.keys(my).sort(), enKeys);
  for (const key of enKeys) {
    assert.ok(en[key as keyof typeof en].length > 0, `en.${key} is empty`);
    assert.ok(my[key as keyof typeof my].length > 0, `my.${key} is empty`);
  }
});

test('placeholders are the same in every language', () => {
  const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.equal(placeholders(my[key]), placeholders(en[key]), `placeholders differ in ${key}`);
  }
});

test('translate interpolates and leaves unknown placeholders alone', () => {
  assert.equal(translate('en', 'account_version', { version: '1.2.3' }), 'Version 1.2.3');
  assert.equal(translate('en', 'account_version'), 'Version {version}');
});

test('Burmese digits and counts', () => {
  assert.equal(toBurmeseDigits('12 / 4'), '၁၂ / ၄');
  assert.equal(formatCount(1200, 'my'), '၁,၂၀၀');
  assert.equal(formatCount(1200, 'en'), '1,200');
});

test('language codes from devices and APIs', () => {
  assert.equal(normalizeLanguage('my-MM'), 'my');
  assert.equal(normalizeLanguage('mm'), 'my');
  assert.equal(normalizeLanguage('en_US'), 'en');
  assert.equal(normalizeLanguage('fr'), null);
});

test('localDateKey uses the time zone, not UTC', () => {
  // 2026-09-10T17:30:00Z is already 2026-09-11 in Asia/Yangon (UTC+6:30)
  const date = new Date('2026-09-10T17:30:00Z');
  assert.equal(localDateKey(date, 'Asia/Yangon'), '2026-09-11');
  assert.equal(localDateKey(date, 'UTC'), '2026-09-10');
});
