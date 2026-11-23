import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createScheduler } from './scheduler';

test('scheduler never starts more than N tasks per second', async () => {
  let clock = 0;
  const waits: number[] = [];
  const scheduler = createScheduler({
    perSecond: 3,
    now: () => clock,
    wait: async (ms) => {
      waits.push(ms);
      clock += ms;
    },
  });
  const starts: number[] = [];
  const tasks = Array.from({ length: 7 }, (_, index) =>
    scheduler.schedule(async () => {
      starts.push(clock);
      return index;
    }),
  );
  const results = await Promise.all(tasks);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6]);
  // first three start immediately, the rest are spaced by ~333ms
  assert.deepEqual(starts.slice(0, 3), [0, 0, 0]);
  for (let i = 3; i < starts.length; i += 1) {
    assert.ok(starts[i]! - starts[i - 1]! >= 300, `task ${i} started too soon`);
  }
  assert.ok(waits.length > 0);
});

test('scheduler propagates rejections without blocking the queue', async () => {
  const scheduler = createScheduler({ perSecond: 100, wait: async () => undefined });
  await assert.rejects(scheduler.schedule(async () => Promise.reject(new Error('boom'))), /boom/);
  assert.equal(await scheduler.schedule(async () => 'ok'), 'ok');
});

test('scheduler keeps going when the wall clock jumps backwards', async () => {
  let clock = 1_000_000;
  const scheduler = createScheduler({
    perSecond: 3,
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
  });
  await Promise.all(Array.from({ length: 3 }, () => scheduler.schedule(async () => undefined)));
  clock -= 600_000; // the user set the time back ten minutes
  const before = clock;
  await scheduler.schedule(async () => undefined);
  assert.ok(clock - before < 2_000, `waited ${clock - before}ms after the clock jumped back`);
});
