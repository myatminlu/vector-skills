import type { ComponentType } from 'react';

import { registry } from './slots';

/**
 * Wraps the default export of an account-only route. Without a guest mode nobody reaches the app stack signed out, so
 * the screen renders as it is; with one (the guest module) a guest sees a "sign in to continue" screen instead of a
 * screen that would read a user who is not there. The gate is looked up while rendering, not when the route file loads.
 */
export function withAccount<P extends object>(Screen: ComponentType<P>, feature: string): ComponentType<P> {
  function AccountOnly(props: P) {
    const Gate = registry.accountGate();
    if (!Gate) return <Screen {...props} />;
    return (
      <Gate feature={feature}>
        <Screen {...props} />
      </Gate>
    );
  }
  AccountOnly.displayName = `withAccount(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return AccountOnly;
}
