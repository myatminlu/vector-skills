import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nearestTextSize, parseTextSize, textScaleFor } from './text-size';

test('stored values snap to the nearest stop; junk is the default', () => {
  assert.equal(parseTextSize('118'), 115);
  assert.equal(parseTextSize('large'), 100);
  assert.equal(parseTextSize(null), 100);
  assert.equal(nearestTextSize(1000), 130);
});

test('a stop is a multiple of the base scale', () => {
  assert.equal(textScaleFor(100), 1);
  assert.equal(textScaleFor(130), 1.3);
});
