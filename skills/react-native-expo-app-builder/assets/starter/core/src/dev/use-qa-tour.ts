import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { QA_TOUR_ENABLED } from '@/config/env';
import { registry, slots } from '@/modules/slots';

import { CORE_STEPS, QA_STEP_MS } from './qa-tour';

/**
 * Screenshot tour for QA builds (`EXPO_PUBLIC_QA_TOUR=1`, plus the QA credentials in the *build command's* environment
 * when the app has accounts — never in a file). Waits until the tour may start (the auth module signs in as the QA
 * account and refuses any other), lets modules prepare (the consent module answers its gate for the QA account), then
 * walks the steps. A no-op in every other build.
 */
export function useQaTour() {
  const ready = slots.useQaTourReady();
  const started = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!QA_TOUR_ENABLED || !ready || started.current) return;
    started.current = true;
    registry.qaTourStart().forEach((prepare) => prepare());
    const steps = [...CORE_STEPS, ...registry.tourSteps()].sort((a, b) => a.order - b.order);
    steps.forEach((step, index) => {
      timers.current.push(
        setTimeout(() => {
          console.log(`[qa-tour] ${index + 1}/${steps.length} ${step.name}`);
          if (!step.keep && router.canDismiss()) router.dismissAll();
          try {
            step.go();
          } catch (error) {
            console.warn('[qa-tour] navigation failed', step.name, error);
          }
        }, 3_000 + index * QA_STEP_MS),
      );
    });
  }, [ready]);
}
