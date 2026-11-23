import { useSyncExternalStore } from 'react';

import { localStore } from '@/lib/local-store';

import { CONSENT_VERSION } from './disclosure';

export type ConsentRecord = { version: number; granted: boolean; at: string };

const consentKey = (userId: string) => `consent.${userId}`;

/** Only a yes to the current disclosure counts; no answer, a no, or an older version asks again. */
export function isConsentCurrent(record: unknown, version = CONSENT_VERSION): boolean {
  if (!record || typeof record !== 'object') return false;
  const answer = record as Partial<ConsentRecord>;
  return answer.granted === true && answer.version === version;
}

const cache = new Map<string, ConsentRecord | null>();
const listeners = new Set<() => void>();

function write(userId: string, granted: boolean): void {
  const record: ConsentRecord = { version: CONSENT_VERSION, granted, at: new Date().toISOString() };
  localStore.setJsonSync(consentKey(userId), record);
  cache.set(userId, record);
  listeners.forEach((listener) => listener());
}

/** Per account, kept on the phone, read synchronously so a send can be checked without a round trip. */
export const consent = {
  record(userId: string): ConsentRecord | null {
    if (!cache.has(userId)) cache.set(userId, localStore.getJsonSync<ConsentRecord>(consentKey(userId)));
    return cache.get(userId) ?? null;
  },
  isGranted(userId: string): boolean {
    return isConsentCurrent(consent.record(userId));
  },
  grant(userId: string): void {
    write(userId, true);
  },
  withdraw(userId: string): void {
    write(userId, false);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useConsentGranted(userId: string): boolean {
  const granted = () => consent.isGranted(userId);
  return useSyncExternalStore(consent.subscribe, granted, granted);
}
