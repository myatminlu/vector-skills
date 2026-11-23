import { setSessionlessCheck } from '@/lib/api/client';
import { onSessionChange } from '@/modules/auth/session';
import { registerModule } from '@/modules/slots';
import { sheetOptions } from '@/navigation/screen-options';

import { ContinueAsGuest, GuestAccountHeader } from './components';
import { guestMode, useGuestMode } from './guest-mode';
import { GuestAccountGate, useGuestRequireAccount } from './require-account';

// An account-only request from a guest is answered locally (AUTH_REQUIRED), never sent.
setSessionlessCheck(() => guestMode.isActive());
// Whoever signs in is not a guest — including a session restored at launch, so a later sign-out lands on sign-in.
onSessionChange((user) => {
  if (user) guestMode.exit();
});

registerModule({
  name: 'guest',
  AccountGate: GuestAccountGate,
  overrides: { useGuestActive: useGuestMode, useRequireAccount: useGuestRequireAccount },
  stackScreens: [{ name: '(sheets)/login-required', options: (colors) => sheetOptions(colors) }],
  signInFooter: [{ id: 'guest', order: 10, Component: ContinueAsGuest }],
  accountSections: [{ id: 'guest-header', slot: 'header', order: 20, Component: GuestAccountHeader }],
});
