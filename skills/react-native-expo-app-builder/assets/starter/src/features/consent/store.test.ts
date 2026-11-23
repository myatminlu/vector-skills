import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';

const store = new Map<string, string>();
mock.module('@/lib/local-store', {
  exports: {
    localStore: {
      getJsonSync: (name: string) => (store.has(name) ? JSON.parse(store.get(name)!) : null),
      setJsonSync: (name: string, value: unknown) => void store.set(name, JSON.stringify(value)),
    },
    StoreKeys: { consent: (userId: string) => `consent.${userId}` },
  },
});

let mod: typeof import('./store');

before(async () => {
  mod = await import('./store');
});

test('only a yes to the current disclosure counts', () => {
  assert.equal(mod.isConsentCurrent(null), false);
  assert.equal(mod.isConsentCurrent({ version: 1, granted: false }), false);
  assert.equal(mod.isConsentCurrent({ version: 0, granted: true }), false, 'an answer to an older disclosure asks again');
  assert.equal(mod.isConsentCurrent({ version: 1, granted: true }), true);
});

test('consent is per account and survives a restart of the store', () => {
  mod.consent.grant('u1');
  assert.equal(mod.consent.isGranted('u1'), true);
  assert.equal(mod.consent.isGranted('u2'), false, 'another account on the same phone is asked separately');
  assert.equal(JSON.parse(store.get('consent.u1')!).granted, true);
  mod.consent.withdraw('u1');
  assert.equal(mod.consent.isGranted('u1'), false);
});
