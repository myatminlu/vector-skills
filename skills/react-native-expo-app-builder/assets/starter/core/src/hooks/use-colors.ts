import { useColorScheme } from 'react-native';

import { Colors, type ColorScheme, type ThemeColors } from '@/constants/theme';

/** The palette for the phone's light/dark setting (`userInterfaceStyle: automatic` in app.json). */
export function useColors(): ThemeColors {
  return Colors[useColorSchemeName()];
}

export function useColorSchemeName(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}
