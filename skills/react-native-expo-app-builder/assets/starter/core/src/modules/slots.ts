import type { FontSource } from 'expo-font';

import type { AppModule, Contribution, Overrides } from './types';

/**
 * The core's extension points. Each installed module calls `registerModule` once, from its `index.ts`, which
 * `src/modules/index.ts` imports (that file is generated from `modules.json`). Nothing here imports a module, so there
 * are no import cycles, and the core compiles and runs with no module at all.
 *
 * Read registry values while rendering or handling an event — never at the top level of a file: route files can be
 * evaluated before the modules have registered.
 */
const allowAll = () => true;

const defaults: Overrides = {
  useRootGate: () => ({ ready: true, inApp: true }),
  useSessionUser: () => null,
  useGuestActive: () => false,
  useRequireAccount: () => allowAll,
  withConsent: (_userId, action) => action(),
  useFlag: (_key, fallback) => fallback,
  useTextScale: () => 1,
  useQaTourReady: () => true,
};

/** Call as `slots.useFlag(…)`, `slots.useSessionUser()` — hooks keep their `use` names so the lint rules see them. */
export const slots: Overrides = { ...defaults };

const installed: AppModule[] = [];
const overriddenBy = new Map<keyof Overrides, string>();

export function registerModule(module: AppModule): void {
  if (installed.some((entry) => entry.name === module.name)) return;
  installed.push(module);
  for (const [name, value] of Object.entries(module.overrides ?? {}) as [keyof Overrides, Overrides[keyof Overrides]][]) {
    const previous = overriddenBy.get(name);
    if (previous && typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[modules] ${module.name} replaces ${name}, already replaced by ${previous}`);
    overriddenBy.set(name, module.name);
    (slots as Record<keyof Overrides, unknown>)[name] = value;
  }
}

const sorted = <T>(entries: Contribution<T>[]) => [...entries].sort((a, b) => a.order - b.order);

export const registry = {
  has: (name: string) => installed.some((module) => module.name === name),
  names: () => installed.map((module) => module.name),
  providers: () => installed.flatMap((module) => (module.Provider ? [module.Provider] : [])),
  queryWrapper: () => [...installed].reverse().find((module) => module.wrapQuery)?.wrapQuery ?? null,
  accountGate: () => installed.find((module) => module.AccountGate)?.AccountGate ?? null,
  fonts: (): Record<string, FontSource> => Object.assign({}, ...installed.map((module) => module.fonts ?? {})),
  textScripts: () => installed.flatMap((module) => module.textScripts ?? []),
  stackScreens: () => installed.flatMap((module) => module.stackScreens ?? []),
  homeActions: () => sorted(installed.flatMap((module) => module.homeActions ?? [])),
  itemActions: () => sorted(installed.flatMap((module) => module.itemActions ?? [])),
  accountSections: (slot: 'header' | 'settings' | 'rows') => sorted(installed.flatMap((module) => module.accountSections ?? []).filter((section) => section.slot === slot)),
  signInFooter: () => sorted(installed.flatMap((module) => module.signInFooter ?? [])),
  tourSteps: () => sorted(installed.flatMap((module) => module.tourSteps ?? [])),
  qaTourStart: () => installed.flatMap((module) => (module.onQaTourStart ? [module.onQaTourStart] : [])),
};
