import { useWindowDimensions } from 'react-native';

import { Layout } from '@/constants/theme';

/**
 * True when the window is wider than the reading column plus its margins. A width question, not a device question,
 * so it also covers landscape phones and iPad split view.
 */
export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= Layout.maxWidth + Layout.screenX * 2;
}
