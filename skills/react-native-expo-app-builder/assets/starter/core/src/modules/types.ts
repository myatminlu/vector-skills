import type { QueryClient } from '@tanstack/react-query';
import type { FontSource } from 'expo-font';
import type { Href, NativeStackNavigationOptions } from 'expo-router';
import type { ComponentType, PropsWithChildren, ReactElement, ReactNode } from 'react';

import type { FontWeight, ThemeColors } from '@/constants/theme';
import type { QaStep } from '@/dev/qa-tour';
import type { MessageKey, TranslateParams } from '@/i18n';

/** Something a module adds to a list the core renders; `order` sorts it among the others (lower first). */
export type Contribution<T> = T & { id: string; order: number };

/** The signed-in user as the core sees it. The auth module's `User` satisfies it. */
export type SessionUser = { id: string; email?: string | null; name?: string | null };

export type RootGate = {
  /** False until the stored session has been checked; the splash screen stays up meanwhile. */
  ready: boolean;
  /** Signed in, or browsing as a guest: the app stack is shown instead of the sign-in group. */
  inApp: boolean;
  /** Where a signed-out user is sent. Set only by a module that ships an `(auth)` route group. */
  signInHref?: Href;
};

export type TextScript = {
  /** True when `text` must be drawn with this script's font and line height. */
  test: (text: string) => boolean;
  fontFamily: (weight: FontWeight) => string | undefined;
  lineHeight: (fontSize: number) => number;
};

export type Translate = (key: MessageKey, params?: TranslateParams) => string;

/** Behaviour a module replaces. Each has a default in `slots.ts` that is right for an app without that module. */
export type Overrides = {
  useRootGate: () => RootGate;
  useSessionUser: () => SessionUser | null;
  useGuestActive: () => boolean;
  /** `requireAccount(feature)` is true when the action may run; otherwise it has already asked the user to sign in. */
  useRequireAccount: () => (feature: string) => boolean;
  /** Runs `action` once the user allowed their data to go to the AI provider; nothing on a no. */
  withConsent: (userId: string, action: () => void) => void;
  useFlag: (key: string, fallback: boolean) => boolean;
  useTextScale: () => number;
  /** True when the QA tour may start (signed in as the QA account, when the app has accounts). */
  useQaTourReady: () => boolean;
};

export type AppModule = {
  name: string;
  /** Wraps the app inside the core providers, in module order. */
  Provider?: ComponentType<PropsWithChildren>;
  /** Wraps the tree in TanStack Query's provider instead of the default one (offline persistence). The last one wins. */
  wrapQuery?: (client: QueryClient, children: ReactNode) => ReactElement;
  /** Shown instead of an account-only screen when nobody is signed in (see `withAccount`). */
  AccountGate?: ComponentType<PropsWithChildren<{ feature: string }>>;
  /** Fonts loaded before the first frame (`useFonts` map). */
  fonts?: Record<string, FontSource>;
  textScripts?: TextScript[];
  /** Presentation of the module's routes under `(app)` (sheets, titles). */
  stackScreens?: { name: string; options: (colors: ThemeColors, t: Translate) => NativeStackNavigationOptions }[];
  homeActions?: Contribution<{ Component: ComponentType }>[];
  itemActions?: Contribution<{ Component: ComponentType<{ itemId: string }> }>[];
  accountSections?: Contribution<{ slot: 'header' | 'settings' | 'rows'; Component: ComponentType }>[];
  signInFooter?: Contribution<{ Component: ComponentType<{ busy: boolean }> }>[];
  tourSteps?: Contribution<QaStep>[];
  onQaTourStart?: () => void;
  overrides?: Partial<Overrides>;
};
