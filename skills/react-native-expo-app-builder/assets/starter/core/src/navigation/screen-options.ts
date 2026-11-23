import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';

import { Radius, type ThemeColors } from '@/constants/theme';

/** Native header styling shared by every pushed screen. */
export function stackOptions(colors: ThemeColors): NativeStackNavigationOptions {
  return {
    headerShown: true,
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: colors.bg },
  };
}

/** Native bottom sheet (UISheetPresentationController on iOS, a bottom sheet dialog on Android). */
export function sheetOptions(colors: ThemeColors, detents: number[] | 'fitToContents' = 'fitToContents'): NativeStackNavigationOptions {
  return {
    presentation: 'formSheet',
    headerShown: false,
    sheetAllowedDetents: detents,
    sheetGrabberVisible: true,
    sheetCornerRadius: Radius.sheet,
    contentStyle: { backgroundColor: colors.surfaceRaised },
    gestureEnabled: true,
  };
}

/** A tall modal that lays itself out (header, scrolling body, pinned footer) — iOS page sheet, Android full screen. */
export function pageSheetOptions(colors: ThemeColors): NativeStackNavigationOptions {
  return {
    presentation: 'modal',
    headerShown: false,
    animation: Platform.OS === 'android' ? 'slide_from_bottom' : 'default',
    contentStyle: { backgroundColor: colors.surfaceRaised },
  };
}
