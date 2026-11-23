import { router } from 'expo-router';
import { Keyboard } from 'react-native';

import { href } from '@/navigation/routes';

import { consent } from './store';

/** How long the closing consent sheet needs before the next modal can be presented. */
const SHEET_CLOSE_MS = 500;

let request: Promise<boolean> | null = null;
let answer: ((granted: boolean) => void) | null = null;

/**
 * Resolves true once the user has allowed their data to go to the AI provider: at once when they already have,
 * otherwise after the consent sheet closes. EVERY path that sends personal data to the provider waits on this first
 * (App Store 5.1.2(i)) — the composer, retries, voice, suggested prompts. Concurrent callers share one sheet.
 */
export function ensureConsent(userId: string): Promise<boolean> {
  if (consent.isGranted(userId)) return Promise.resolve(true);
  if (!request) {
    request = new Promise<boolean>((resolve) => {
      answer = resolve;
    }).then((granted) => new Promise<boolean>((resolve) => setTimeout(() => resolve(granted), SHEET_CLOSE_MS)));
    // The composer that asked may still hold the keyboard, which would cover the sheet's buttons.
    Keyboard.dismiss();
    router.push(href.sheet.consent());
  }
  return request;
}

let actionQueued = false;

/** Runs `action` once sharing is allowed; nothing on a no. Single-flight: a second tap during the sheet's close is ignored. */
export function withConsent(userId: string, action: () => void): void {
  if (actionQueued) return;
  actionQueued = true;
  void ensureConsent(userId).then((granted) => {
    actionQueued = false;
    if (granted) action();
  });
}

/** The sheet reports its answer here, once per presentation. A no-op when Account opened the sheet. */
export function answerConsentRequest(granted: boolean): void {
  const resolve = answer;
  answer = null;
  request = null;
  resolve?.(granted);
}

let mountedSheets = 0;

/**
 * For the sheet's mount effect; returns its cleanup. A sheet that goes away without a button — swiped down, Android
 * back, sign-out — answers the request it was opened for with whatever is stored (normally a no). The check waits a
 * tick so React's development double mount does not count as closing.
 */
export function trackConsentSheet(userId: string): () => void {
  mountedSheets += 1;
  const openedFor = answer;
  return () => {
    mountedSheets -= 1;
    setTimeout(() => {
      if (mountedSheets === 0 && answer === openedFor) answerConsentRequest(consent.isGranted(userId));
    }, 0);
  };
}
