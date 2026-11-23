import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, isUnauthorizedError, onUnauthorized } from '@/lib/api';
import { tokensFrom } from '@/lib/api/client';
import { guestMode } from '@/lib/guest-mode';
import { localStore, StoreKeys } from '@/lib/local-store';
import { tokenStore } from '@/lib/token-store';
import type { User } from '@/types/api';

type AuthContextValue = {
  user: User | null;
  /** True until the stored session has been checked at launch. */
  isLoading: boolean;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  reloadUser: () => Promise<void>;
  /** Bumped whenever a session starts or ends, so a slow request can tell its session is over. */
  sessionEpoch: () => number;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const sessionListeners = new Set<(user: User | null) => void>();
let lastSessionUser: User | null | undefined;

/** Lets non-React modules (push, analytics) follow sign-in and sign-out. Replays the current user on subscribe. */
export function onSessionChange(listener: (user: User | null) => void): () => void {
  sessionListeners.add(listener);
  if (lastSessionUser) listener(lastSessionUser);
  return () => {
    sessionListeners.delete(listener);
  };
}

function notifySession(user: User | null) {
  const unchanged = lastSessionUser !== undefined && user?.id === lastSessionUser?.id && Boolean(user) === Boolean(lastSessionUser);
  lastSessionUser = user;
  if (!unchanged) sessionListeners.forEach((listener) => listener(user));
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const epoch = useRef(0);

  const setUser = useCallback((next: User | null) => {
    setUserState(next);
    if (next) localStore.setJsonSync(StoreKeys.cachedUser, next);
    else localStore.removeSync(StoreKeys.cachedUser);
    // Whoever is signed in is not a guest — including a session restored at launch, so a later sign-out still lands
    // on the sign-in screen.
    if (next) guestMode.exit();
    notifySession(next);
  }, []);

  const endLocalSession = useCallback(async () => {
    epoch.current += 1;
    await tokenStore.clear();
    queryClient.clear();
    setUser(null);
  }, [queryClient, setUser]);

  // A 401 the client could not recover from (refresh refused) ends the session here, wherever it happened.
  useEffect(() => onUnauthorized(() => void endLocalSession()), [endLocalSession]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!(await tokenStore.getRefreshToken())) return;
        try {
          const current = await api.auth.me();
          if (active) setUser(current);
        } catch (error) {
          // A refused session (401) has already been torn down by the client. Anything else — offline, a time-out, a
          // 5xx while the backend restarts, a 429 — is transient: keep the session and show the cached user. Signing
          // people out because the server was restarting is a bug.
          if (isUnauthorizedError(error)) return;
          const cached = localStore.getJsonSync<User>(StoreKeys.cachedUser);
          if (cached && active) setUser(cached);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [setUser]);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const response = await api.auth.login(input);
      const tokens = tokensFrom(response);
      if (!tokens) throw new Error('Sign-in response has no tokens');
      epoch.current += 1;
      queryClient.clear();
      await tokenStore.set(tokens);
      setUser(response.user);
    },
    [queryClient, setUser],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Sign-out must complete without a network.
    } finally {
      await endLocalSession();
    }
  }, [endLocalSession]);

  const deleteAccount = useCallback(async () => {
    await api.auth.deleteMe();
    await endLocalSession();
  }, [endLocalSession]);

  const reloadUser = useCallback(async () => {
    setUser(await api.auth.me());
  }, [setUser]);

  const sessionEpoch = useCallback(() => epoch.current, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, signIn, signOut, deleteAccount, reloadUser, sessionEpoch }),
    [user, isLoading, signIn, signOut, deleteAccount, reloadUser, sessionEpoch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/**
 * For screens that only render for a signed-in user. Guests reach the app stack too, so a screen that calls this must
 * be wrapped in `withAccount` (features/guest) — or it throws for them.
 */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside a signed-in route — wrap the screen in withAccount');
  return user;
}
