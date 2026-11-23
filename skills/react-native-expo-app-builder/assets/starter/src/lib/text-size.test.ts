import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fontScaleCap, nearestTextSize, parseTextSize, scaleFontSize } from './text-size';

test('stored values snap to the nearest stop; junk is the default', () => {
  assert.equal(parseTextSize('118'), 115);
  assert.equal(parseTextSize('large'), 100);
  assert.equal(parseTextSize(null), 100);
  assert.equal(nearestTextSize(1000), 130);
});

test('scaled sizes stay on the half-point grid', () => {
  assert.equal(scaleFontSize(16, 1.15), 18.5);
});

test('the OS font scale gets what the in-app size left of the limit, never below 1', () => {
  assert.equal(fontScaleCap(2, 1), 2);
  assert.equal(fontScaleCap(2, 1.3), 2 / 1.3);
  assert.equal(fontScaleCap(1.2, 1.3), 1);
  assert.equal(fontScaleCap(0, 1.3), 0);
});
