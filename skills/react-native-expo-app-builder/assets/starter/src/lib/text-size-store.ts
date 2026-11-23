import { useSyncExternalStore } from 'react';

import { localStore, StoreKeys } from '@/lib/local-store';
import { parseTextSize, type TextSize, textScaleFor } from '@/lib/text-size';

/**
 * The chosen in-app text size. Module-level rather than a provider so every `AppText` can read it — the error
 * boundary draws its fallback outside the providers — and read synchronously at import so the first frame is right.
 * Belongs to the phone, not the account.
 */
let current: TextSize = parseTextSize(localStore.getSync(StoreKeys.textSize));
const listeners = new Set<() => void>();

export const textSize = {
  get(): TextSize {
    return current;
  },
  set(next: TextSize): void {
    if (next === current) return;
    current = next;
    localStore.setSync(StoreKeys.textSize, String(next));
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useTextSize(): TextSize {
  return useSyncExternalStore(textSize.subscribe, textSize.get, textSize.get);
}

export function useTextScale(): number {
  return textScaleFor(useTextSize());
}
