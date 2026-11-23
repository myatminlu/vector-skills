import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INITIAL_CONNECTIVITY, isOnline, netInfoOnline, shouldProbe, withNetInfo, withProbeResult } from './connectivity-state';

const offline = { isConnected: false, isInternetReachable: false };
const unreachable = { isConnected: true, isInternetReachable: false };
const online = { isConnected: true, isInternetReachable: true };

test('unknown connectivity counts as online; only a definite no is offline', () => {
  assert.equal(netInfoOnline(null), true);
  assert.equal(netInfoOnline({ isConnected: null, isInternetReachable: null }), true);
  assert.equal(netInfoOnline({ isConnected: true, isInternetReachable: null }), true);
  assert.equal(netInfoOnline(unreachable), false);
  assert.equal(netInfoOnline(offline), false);
  assert.equal(isOnline(INITIAL_CONNECTIVITY), true);
  assert.equal(shouldProbe(INITIAL_CONNECTIVITY), false);
});

test('a reachable API overrides a stale offline verdict until a probe fails or NetInfo changes its mind', () => {
  const believedOffline = withNetInfo(INITIAL_CONNECTIVITY, offline);
  assert.equal(isOnline(believedOffline), false);
  assert.equal(shouldProbe(believedOffline), true);

  const overridden = withProbeResult(believedOffline, true);
  assert.equal(isOnline(overridden), true);
  // Still probing while NetInfo disagrees, so a real drop is noticed.
  assert.equal(shouldProbe(overridden), true);
  // The same report again (a refresh) does not flash the banner back on.
  assert.equal(withNetInfo(overridden, { ...offline }), overridden);
  // A changed report is fresh evidence and resets the override.
  assert.equal(isOnline(withNetInfo(overridden, unreachable)), false);
  assert.equal(isOnline(withProbeResult(overridden, false)), false);
  assert.equal(isOnline(withNetInfo(overridden, online)), true);
});

test('probe results are ignored while NetInfo already says online', () => {
  const state = withNetInfo(INITIAL_CONNECTIVITY, online);
  assert.equal(withProbeResult(state, true), state);
  assert.equal(withProbeResult(state, false), state);
  assert.equal(shouldProbe(state), false);
});
