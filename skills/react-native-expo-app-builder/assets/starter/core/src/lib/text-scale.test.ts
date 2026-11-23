import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fontScaleCap, scaleFontSize } from './text-scale';

test('scaled sizes stay on the half-point grid', () => {
  assert.equal(scaleFontSize(16, 1.15), 18.5);
  assert.equal(scaleFontSize(16, 1), 16);
});

test('the OS font scale gets what the in-app size left of the limit, never below 1', () => {
  assert.equal(fontScaleCap(2, 1), 2);
  assert.equal(fontScaleCap(2, 1.3), 2 / 1.3);
  assert.equal(fontScaleCap(1.2, 1.3), 1);
  assert.equal(fontScaleCap(0, 1.3), 0);
});
