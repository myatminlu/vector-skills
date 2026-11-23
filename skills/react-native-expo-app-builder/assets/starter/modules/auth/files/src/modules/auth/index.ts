import { router } from 'expo-router';

import { setTokenStore } from '@/lib/api/client';
import { registerModule } from '@/modules/slots';
import { sheetOptions } from '@/navigation/screen-options';

import { AccountHeader, DeleteAccountRow, SaveAction, SavedButton, SignOutRow } from './components';
import { authHref } from './routes';
import { AuthProvider, useAuthRootGate, useQaTourSignIn, useSessionUser } from './session';
import { tokenStore } from './token-store';

// Requests now carry the session's token, refresh it once on a 401 and end the session if the server refuses.
setTokenStore(tokenStore);

registerModule({
  name: 'auth',
  Provider: AuthProvider,
  overrides: { useRootGate: useAuthRootGate, useSessionUser, useQaTourReady: useQaTourSignIn },
  stackScreens: [
    { name: 'saved', options: (_colors, t) => ({ title: t('saved_title') }) },
    { name: '(sheets)/delete-account', options: (colors) => sheetOptions(colors) },
  ],
  homeActions: [{ id: 'saved', order: 10, Component: SavedButton }],
  itemActions: [{ id: 'save', order: 10, Component: SaveAction }],
  accountSections: [
    { id: 'auth-header', slot: 'header', order: 10, Component: AccountHeader },
    { id: 'sign-out', slot: 'rows', order: 60, Component: SignOutRow },
    { id: 'delete-account', slot: 'rows', order: 70, Component: DeleteAccountRow },
  ],
  tourSteps: [
    { id: 'saved', order: 30, name: 'saved', go: () => router.push(authHref.saved()) },
    { id: 'delete-account-sheet', order: 86, name: 'delete-account-sheet', go: () => router.push(authHref.deleteAccount()) },
  ],
});
