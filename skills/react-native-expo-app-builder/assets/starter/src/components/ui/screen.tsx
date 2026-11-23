import { HeaderHeightContext } from 'expo-router/react-navigation';
import { type PropsWithChildren, type ReactNode, use } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, type ScrollViewProps, type StyleProp, View, type ViewStyle } from 'react-native';
import { type Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Layout, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type ScreenProps = PropsWithChildren<{
  /** Scrollable body (default true). */
  scroll?: boolean;
  /** `form` narrows the column for inputs and their buttons. */
  width?: 'reading' | 'form';
  /** Screens without a native header (sign-in, tab roots without a header) pad for the status bar themselves. */
  topInset?: boolean;
  /** Fixed footer under the scroll area (a primary action). */
  footer?: ReactNode;
  /** Keep the focused input and the footer above the keyboard. */
  keyboard?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'children' | 'refreshControl' | 'contentContainerStyle'>;
  testID?: string;
}>;

/**
 * A screen's frame: background, safe areas, scrolling, keyboard avoidance and the centred content column. Every
 * screen goes through it, so tablets, the keyboard and safe areas are each solved once.
 *
 * Screens that own a FlatList cannot use it — they spread `contentColumn` into the list's `contentContainerStyle`.
 */
export const contentColumn = { width: '100%', maxWidth: Layout.maxWidth, alignSelf: 'center' } as const;

export function Screen({ children, scroll = true, width = 'reading', topInset = false, footer, keyboard = false, refreshing, onRefresh, contentStyle, scrollProps, testID }: ScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  // KeyboardAvoidingView measures its own frame relative to its parent but the keyboard in window coordinates, so
  // under a native header its padding comes out short by the header's height.
  const headerHeight = use(HeaderHeightContext) ?? 0;
  const automatic = Platform.OS === 'ios' && scroll && !topInset;

  const content = (
    <View
      style={[
        {
          width: '100%',
          maxWidth: width === 'form' ? Layout.formWidth : Layout.maxWidth,
          alignSelf: 'center',
          paddingHorizontal: Layout.screenX,
          paddingTop: topInset ? Spacing.sm : Spacing.md,
          paddingBottom: footer ? Spacing.lg : Math.max(automatic ? 0 : insets.bottom, Spacing.lg) + Spacing.sm,
          flexGrow: 1,
        },
        contentStyle,
      ]}>
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      testID={testID}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior={automatic ? 'automatic' : 'never'}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} /> : undefined}
      {...scrollProps}>
      {content}
    </ScrollView>
  ) : (
    <View testID={testID} style={{ flex: 1 }}>
      {content}
    </View>
  );

  const footerView = footer ? (
    <View style={{ paddingHorizontal: Layout.screenX, paddingTop: Spacing.sm, paddingBottom: Math.max(insets.bottom, Spacing.lg), backgroundColor: colors.bg }}>
      <View style={{ width: '100%', maxWidth: width === 'form' ? Layout.formWidth : Layout.maxWidth, alignSelf: 'center', gap: Spacing.sm }}>{footer}</View>
    </View>
  ) : null;

  const wrapped = keyboard ? (
    // `padding` on Android too: apps are edge-to-edge, which switches off the window resize the manifest setting used
    // to give, so nothing moves unless the view avoids the keyboard itself.
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={topInset ? 0 : headerHeight}>
      {body}
      {footerView}
    </KeyboardAvoidingView>
  ) : (
    <>
      {body}
      {footerView}
    </>
  );

  if (topInset) {
    const edges: Edge[] = footer ? ['top'] : ['top', 'bottom'];
    return (
      <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
        {wrapped}
      </SafeAreaView>
    );
  }
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{wrapped}</View>;
}
