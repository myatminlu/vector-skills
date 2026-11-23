import Storage from 'expo-sqlite/kv-store';

/**
 * Typed wrapper over the SQLite-backed key-value store. Synchronous getters exist for boot-time reads (language,
 * text size, guest mode) so the first frame is already right; a storage failure never crashes the UI.
 */
const PREFIX = 'app.';

function key(name: string): string {
  return `${PREFIX}${name}`;
}

export const localStore = {
  getSync(name: string): string | null {
    try {
      return Storage.getItemSync(key(name));
    } catch {
      return null;
    }
  },

  setSync(name: string, value: string): void {
    try {
      Storage.setItemSync(key(name), value);
    } catch {
      // Storage failures must never crash the UI.
    }
  },

  removeSync(name: string): void {
    try {
      Storage.removeItemSync(key(name));
    } catch {
      // ignore
    }
  },

  getJsonSync<T>(name: string): T | null {
    const raw = localStore.getSync(name);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setJsonSync(name: string, value: unknown): void {
    localStore.setSync(name, JSON.stringify(value));
  },
};

/**
 * The core's keys. Modules keep theirs next to their code (`auth.cachedUser`, `settings.textSize`, …); a per-user key
 * takes the user id, so two accounts on one phone never mix.
 */
export const StoreKeys = {
  language: 'settings.language',
} as const;
