import { router } from 'expo-router';

import { currentUser } from '@/modules/auth/session';
import { registerModule } from '@/modules/slots';
import { pageSheetOptions } from '@/navigation/screen-options';

import { ConsentRow } from './consent-row';
import { withConsent } from './gate';
import { consentHref } from './routes';
import { consent } from './store';

registerModule({
  name: 'ai-consent',
  overrides: { withConsent },
  // A page sheet, not a form sheet: it pins its buttons under a scrolling body.
  stackScreens: [{ name: '(sheets)/consent', options: (colors) => pageSheetOptions(colors) }],
  accountSections: [{ id: 'ai-consent', slot: 'rows', order: 10, Component: ConsentRow }],
  tourSteps: [{ id: 'consent-sheet', order: 85, name: 'consent-sheet', go: () => router.push(consentHref()) }],
  // The tour opens consent-gated screens; answer the gate the way a tester would — the tour runs as the QA account only.
  onQaTourStart: () => {
    const user = currentUser();
    if (user) consent.grant(user.id);
  },
});
