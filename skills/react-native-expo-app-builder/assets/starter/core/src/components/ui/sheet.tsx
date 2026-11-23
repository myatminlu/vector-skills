import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Layout, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

/**
 * Body of a screen presented as a native form sheet (see `sheetOptions`). On iOS a form sheet resizes the first
 * ScrollView to the whole sheet, so the ScrollView is the root here and the actions sit inside the content.
 */
export function SheetScaffold({ title, body, children, header }: PropsWithChildren<{ title?: string; body?: string; header?: ReactNode }>) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: colors.surfaceRaised }}
      contentContainerStyle={{ paddingTop: Platform.OS === 'ios' ? Spacing.xxl : Spacing.lg, paddingHorizontal: Layout.screenX, paddingBottom: Math.max(insets.bottom, Spacing.xl) + Spacing.sm }}
      keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: Layout.formWidth, alignSelf: 'center', gap: Spacing.sm }}>
        {header}
        {title ? (
          <AppText variant="headline" accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
        {body ? (
          <AppText variant="body" tone="muted">
            {body}
          </AppText>
        ) : null}
        {children}
      </View>
    </ScrollView>
  );
}

type ConfirmSheetProps = {
  title: string;
  body?: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  destructive?: boolean;
  loading?: boolean;
  /** Shown above the buttons when the action failed; the sheet stays open so it can be retried. */
  error?: string | null;
  primaryTestID?: string;
  secondaryTestID?: string;
};

export function ConfirmSheet({ title, body, primaryLabel, secondaryLabel, onPrimary, onSecondary, destructive = false, loading = false, error, primaryTestID, secondaryTestID }: ConfirmSheetProps) {
  return (
    <SheetScaffold title={title} body={body}>
      {error ? (
        <AppText variant="footnote" tone="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
        <Button testID={primaryTestID} label={primaryLabel} onPress={onPrimary} variant={destructive ? 'danger' : 'primary'} loading={loading} />
        <Button testID={secondaryTestID} label={secondaryLabel} onPress={onSecondary} variant="ghost" disabled={loading} />
      </View>
    </SheetScaffold>
  );
}
