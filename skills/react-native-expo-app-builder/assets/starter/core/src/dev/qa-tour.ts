import { router } from 'expo-router';

import { href } from '@/navigation/routes';

/**
 * Screens the QA tour visits, in order, one every `QA_STEP_MS`. Modules add steps for their routes (`tourSteps`).
 * Add a step for every new route — the tour is how the agent sees every screen on every device without a person
 * tapping through them.
 *
 * Each step logs `[qa-tour] n/N name`; capture screenshots off those log lines rather than a stopwatch.
 */
export type QaStep = { name: string; go: () => void; /** Leave the current screen in place (a wait step). */ keep?: boolean };

export const CORE_STEPS: (QaStep & { id: string; order: number })[] = [
  { id: 'home', order: 10, name: 'home', go: () => router.navigate(href.home()) },
  { id: 'item', order: 20, name: 'item', go: () => router.push(href.item('1')) },
  { id: 'account', order: 80, name: 'account', go: () => router.navigate(href.account()) },
  { id: 'gallery', order: 90, name: 'gallery', go: () => router.push(href.gallery()) },
];

export const QA_STEP_MS = 4_000;
