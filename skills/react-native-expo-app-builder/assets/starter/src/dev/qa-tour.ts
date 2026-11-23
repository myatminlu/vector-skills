import { router } from 'expo-router';

import { href } from '@/navigation/routes';

/**
 * Screens the QA tour visits, in order, one every `QA_STEP_MS`. Add a step for every new route — the tour is how the
 * agent sees every screen on every device without a person tapping through them.
 *
 * Each step logs `[qa-tour] n/N name`; capture screenshots off those log lines rather than a stopwatch.
 */
export type QaStep = { name: string; go: () => void; /** Leave the current screen in place (a wait step). */ keep?: boolean };

export const QA_STEPS: QaStep[] = [
  { name: 'home', go: () => router.navigate(href.home()) },
  { name: 'item', go: () => router.push(href.item('1')) },
  { name: 'ask', go: () => router.push(href.ask({ itemId: '1' })) },
  { name: 'saved', go: () => router.push(href.saved()) },
  { name: 'account', go: () => router.navigate(href.account()) },
  { name: 'consent-sheet', go: () => router.push(href.sheet.consent()) },
  { name: 'delete-account-sheet', go: () => router.push(href.sheet.deleteAccount()) },
  { name: 'gallery', go: () => router.push(href.gallery()) },
];

export const QA_STEP_MS = 4_000;
