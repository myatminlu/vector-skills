/**
 * Pure connectivity reducer. NetInfo's report is the base signal; the app's own evidence — its API answered a
 * probe or a request — can override a "no internet" verdict, because on iOS the native reachability state is a
 * cached callback value that can go stale (the simulator after the Mac reconnects, a captive portal that cleared)
 * and on Android "validated" is judged against Google's servers, not ours.
 */
export type NetSnapshot = { isConnected: boolean | null; isInternetReachable: boolean | null };

export type ConnectivityState = {
  /** Last NetInfo report; `null` before the first one. */
  net: NetSnapshot | null;
  /** The API answered after NetInfo last said offline, so the app treats itself as online until a probe fails. */
  probedOnline: boolean;
};

export const INITIAL_CONNECTIVITY: ConnectivityState = { net: null, probedOnline: false };

/** NetInfo's own verdict. Unknown (`null`) counts as online so nothing is paused before the first report. */
export function netInfoOnline(net: NetSnapshot | null): boolean {
  return net === null || (net.isConnected !== false && net.isInternetReachable !== false);
}

export function isOnline(state: ConnectivityState): boolean {
  return netInfoOnline(state.net) || state.probedOnline;
}

/** The app probes its API itself only while NetInfo says offline — to confirm it, or to catch a stale verdict. */
export function shouldProbe(state: ConnectivityState): boolean {
  return !netInfoOnline(state.net);
}

export function withNetInfo(state: ConnectivityState, net: NetSnapshot): ConnectivityState {
  const same = state.net !== null && state.net.isConnected === net.isConnected && state.net.isInternetReachable === net.isInternetReachable;
  // `NetInfo.refresh()` re-emits an unchanged report; only a changed one is fresh evidence that resets the override.
  if (same) return state;
  return { net: { isConnected: net.isConnected, isInternetReachable: net.isInternetReachable }, probedOnline: false };
}

export function withProbeResult(state: ConnectivityState, reachable: boolean): ConnectivityState {
  const probedOnline = !netInfoOnline(state.net) && reachable;
  return probedOnline === state.probedOnline ? state : { ...state, probedOnline };
}
