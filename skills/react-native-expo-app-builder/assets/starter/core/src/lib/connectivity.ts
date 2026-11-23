import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { fetch as expoFetch } from 'expo/fetch';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { endpoint, onNetworkReachable } from '@/lib/api/client';

import { type ConnectivityState, INITIAL_CONNECTIVITY, isOnline, netInfoOnline, shouldProbe, withNetInfo, withProbeResult } from './connectivity-state';

/** A cheap endpoint that answers without auth. Point it at the backend's health route. */
const HEALTH_PATH = '/health';
/** First own probe soon after NetInfo turns red (a stale verdict clears fast), then every interval while it stays red. */
const FIRST_PROBE_MS = 1_500;
const PROBE_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 6_000;

// Configured at import time, before any listener exists (`configure()` drops earlier listeners). "Internet" for
// this app means its own API answers, so the reachability check is a HEAD on /health rather than a Google host
// that may be throttled or blocked where users are.
NetInfo.configure({
  reachabilityUrl: endpoint(HEALTH_PATH),
  reachabilityMethod: 'HEAD',
  reachabilityTest: (response) => Promise.resolve(response.ok),
  reachabilityRequestTimeout: 10_000,
  reachabilityShortTimeout: 5_000,
  reachabilityLongTimeout: 60_000,
});

let state: ConnectivityState = INITIAL_CONNECTIVITY;
const listeners = new Set<() => void>();
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probing = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function setProbing(next: boolean) {
  if (probing === next) return;
  probing = next;
  notify();
}

function scheduleProbe(delayMs = PROBE_INTERVAL_MS) {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = null;
  if (!shouldProbe(state)) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    void runProbe();
  }, delayMs);
}

function apply(next: ConnectivityState, firstProbe = false) {
  if (next !== state) {
    state = next;
    // react-query pauses fetches while offline and refetches on reconnect (`refetchOnReconnect`).
    onlineManager.setOnline(isOnline(state));
    notify();
  }
  scheduleProbe(firstProbe ? FIRST_PROBE_MS : PROBE_INTERVAL_MS);
}

/**
 * Raw HEAD on the API's health route, outside the scheduler and auth so it works whatever state the app is in.
 * Always settles within the timeout — the loop must never wedge on a request the OS keeps open — and never throws.
 */
async function probe(): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
  });
  const request = expoFetch(`${endpoint(HEALTH_PATH)}?t=${Date.now()}`, { method: 'HEAD', signal: controller.signal }).then(
    (response) => response.ok,
    () => false,
  );
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}

async function runProbe() {
  if (probing) return;
  setProbing(true);
  try {
    const reachable = await probe();
    apply(withProbeResult(state, reachable));
  } finally {
    setProbing(false);
  }
}

/** Tapping the banner: ask NetInfo again and probe the API right now instead of waiting for the next interval. */
export function retryConnectivity(): void {
  void NetInfo.refresh().catch(() => undefined);
  if (shouldProbe(state)) scheduleProbe(0);
}

/**
 * Wires NetInfo, the app's own API evidence and foregrounding into one online/offline verdict. Returns the
 * teardown. Meant to run once for the app's lifetime (from the providers).
 */
export function startConnectivity(): () => void {
  const unsubscribeNetInfo = NetInfo.addEventListener((report) => {
    const wasOffline = shouldProbe(state);
    apply(withNetInfo(state, report), !wasOffline);
  });
  // Any answer from the API (whatever the status) proves the path works; NetInfo is asked to look again as well.
  const unsubscribeReachable = onNetworkReachable(() => {
    if (netInfoOnline(state.net)) return;
    apply(withProbeResult(state, true));
    void NetInfo.refresh().catch(() => undefined);
  });
  // A reachability check that failed just before backgrounding would otherwise stay red for its retry interval.
  const appState = AppState.addEventListener('change', (status) => {
    if (status !== 'active') return;
    void NetInfo.refresh().catch(() => undefined);
    if (shouldProbe(state)) scheduleProbe(0);
  });
  return () => {
    unsubscribeNetInfo();
    unsubscribeReachable();
    appState.remove();
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = null;
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True only when NetInfo says offline and the API has not answered since. */
export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, () => !isOnline(state));
}

/** A probe is in flight (the banner shows a spinner instead of the icon). */
export function useConnectivityChecking(): boolean {
  return useSyncExternalStore(subscribe, () => probing);
}
