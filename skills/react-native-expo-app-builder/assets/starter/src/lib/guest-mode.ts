import { useSyncExternalStore } from 'react';

import { localStore, StoreKeys } from '@/lib/local-store';

/**
 * Browsing without an account (App Store guideline 5.1.1(v): features that are not account-based must work without
 * a login). Nothing is created on the server: a guest is simply "no user, but past the sign-in screen". Kept on the
 * phone so the app reopens where the guest left it, cleared the moment someone signs in. Module-level so the API
 * client can read it without React.
 */
let active = localStore.getSync(StoreKeys.guestMode) === '1';
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (next === active) return;
  active = next;
  if (next) localStore.setSync(StoreKeys.guestMode, '1');
  else localStore.removeSync(StoreKeys.guestMode);
  listeners.forEach((listener) => listener());
}

export const guestMode = {
  isActive(): boolean {
    return active;
  },
  /** "Continue as guest" on the sign-in screen. */
  enter(): void {
    set(true);
  },
  /** Back to the sign-in screen, or a session started. */
  exit(): void {
    set(false);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useGuestMode(): boolean {
  return useSyncExternalStore(guestMode.subscribe, guestMode.isActive, guestMode.isActive);
}
