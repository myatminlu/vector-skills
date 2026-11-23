import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { QA_EMAIL, QA_PASSWORD, QA_TOUR_ENABLED } from '@/config/env';
import { consent } from '@/features/consent/store';
import { useAuth } from '@/providers/auth-provider';

import { QA_STEP_MS, QA_STEPS } from './qa-tour';

/**
 * Screenshot tour for QA builds (`EXPO_PUBLIC_QA_TOUR=1` plus the QA credentials in the *build command's*
 * environment, never in a file). Signs in, then walks `QA_STEPS`. A no-op in every other build.
 *
 * It refuses to run on any account but the QA one: simulators keep whoever signed in last, and a tour that writes
 * must never do so as a real person.
 */
export function useQaTour() {
  const { user, isLoading, signIn } = useAuth();
  const started = useRef(false);
  const signingIn = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!QA_TOUR_ENABLED || isLoading || started.current) return;
    if (!user) {
      if (!signingIn.current && QA_EMAIL && QA_PASSWORD) {
        signingIn.current = true;
        void signIn({ email: QA_EMAIL, password: QA_PASSWORD }).catch((error) => console.warn('[qa-tour] sign-in failed', error));
      }
      return;
    }
    if (QA_EMAIL && user.email.toLowerCase() !== QA_EMAIL.toLowerCase()) {
      console.warn(`[qa-tour] skipped: signed in as ${user.email}, expected ${QA_EMAIL}`);
      return;
    }
    started.current = true;
    // The tour opens the consent-gated screen; answer the gate the way a tester would — QA account only (checked above).
    consent.grant(user.id);
    QA_STEPS.forEach((step, index) => {
      timers.current.push(
        setTimeout(() => {
          console.log(`[qa-tour] ${index + 1}/${QA_STEPS.length} ${step.name}`);
          if (!step.keep && router.canDismiss()) router.dismissAll();
          try {
            step.go();
          } catch (error) {
            console.warn('[qa-tour] navigation failed', step.name, error);
          }
        }, 3_000 + index * QA_STEP_MS),
      );
    });
  }, [isLoading, signIn, user]);
}
