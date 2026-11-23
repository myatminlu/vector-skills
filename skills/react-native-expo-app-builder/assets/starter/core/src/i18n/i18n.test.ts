import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extraLanguages, moduleStrings } from '@/modules/strings';

import { formatCount, localDateKey } from './format';
import { normalizeLanguage, translate } from './index';
import { coreStrings } from './strings';

const en: Record<string, string> = { ...coreStrings, ...moduleStrings };
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');

test('every English string is filled in, and no module redefines a key', () => {
  for (const [key, text] of Object.entries(en)) assert.ok(text.length > 0, `en.${key} is empty`);
  for (const key of Object.keys(moduleStrings)) assert.ok(!(key in coreStrings), `${key} is defined by the core and by a module`);
});

test('every installed language has every key, with the same placeholders', () => {
  for (const language of extraLanguages) {
    for (const [key, text] of Object.entries(en)) {
      const translated = language.strings[key];
      assert.ok(translated, `${language.code}.${key} is missing`);
      assert.equal(placeholders(translated), placeholders(text), `placeholders differ in ${language.code}.${key}`);
    }
  }
});

test('translate interpolates and leaves unknown placeholders alone', () => {
  assert.equal(translate('en', 'account_version', { version: '1.2.3' }), 'Version 1.2.3');
  assert.equal(translate('en', 'account_version'), 'Version {version}');
});

test('English tags map to the app code; unknown ones to nothing', () => {
  assert.equal(normalizeLanguage('en_US'), 'en');
  assert.equal(normalizeLanguage('EN-gb'), 'en');
  assert.equal(normalizeLanguage('xx'), null);
});

test('counts use plain digits in English', () => {
  assert.equal(formatCount(1200, 'en'), '1,200');
});

test('localDateKey uses the time zone, not UTC', () => {
  // 17:30 UTC on the 10th is already the 11th in a zone six and a half hours ahead.
  const date = new Date('2026-09-10T17:30:00Z');
  assert.equal(localDateKey(date, 'Asia/Yangon'), '2026-09-11');
  assert.equal(localDateKey(date, 'UTC'), '2026-09-10');
});
