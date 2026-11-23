import * as SecureStore from 'expo-secure-store';

import { StorageError } from '@/lib/storage-error';

/** One JSON value in the Keychain / Keystore, readable only on this device while it is unlocked. */
const TOKEN_KEY = 'app.auth.tokens';

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

function parseTokens(value: string | null): AuthTokens | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuthTokens>;
    if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

async function getTokens(): Promise<AuthTokens | null> {
  return parseTokens(await SecureStore.getItemAsync(TOKEN_KEY, secureOptions));
}

export const tokenStore = {
  async getAccessToken(): Promise<string | null> {
    return (await getTokens())?.accessToken ?? null;
  },

  async getRefreshToken(): Promise<string | null> {
    return (await getTokens())?.refreshToken ?? null;
  },

  async set(tokens: AuthTokens): Promise<void> {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(tokens), secureOptions);
    } catch (error) {
      throw new StorageError(error instanceof Error ? error.message : 'Secure storage write failed', error);
    }
  },

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY, secureOptions);
  },
};
