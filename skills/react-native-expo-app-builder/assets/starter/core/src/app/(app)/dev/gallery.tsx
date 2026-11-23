import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState } from '@/components/ui/screen-state';
import { Spacing, type TypeVariant, TypeScale } from '@/constants/theme';

/**
 * Every primitive in one screen, in both scripts. The QA tour photographs it, so a change to a primitive shows up on
 * one contact sheet instead of forty screens. Development and QA builds only (see Account).
 */
export default function GalleryScreen() {
  const [value, setValue] = useState('');
  return (
    <Screen contentStyle={{ gap: Spacing.lg }}>
      {(Object.keys(TypeScale) as TypeVariant[]).map((variant) => (
        <View key={variant} style={{ gap: Spacing.xxs }}>
          <AppText variant="caption" tone="faint">
            {variant}
          </AppText>
          <AppText variant={variant}>The quick brown fox</AppText>
          <AppText variant={variant}>မင်္ဂလာပါ၊ ကျန်းမာပါစေ</AppText>
        </View>
      ))}
      <Button label="Primary" onPress={() => undefined} />
      <Button label="Secondary" variant="secondary" onPress={() => undefined} />
      <Button label="Ghost" variant="ghost" onPress={() => undefined} />
      <Button label="Danger" variant="danger" onPress={() => undefined} />
      <Button label="Loading" loading onPress={() => undefined} />
      <FormField label="Field" placeholder="စာရိုက်ပါ…" value={value} onChangeText={setValue} />
      <FormField label="Field with error" value="wrong" error="That does not look right." onChangeText={() => undefined} />
      <ListRow title="List row" subtitle="With a subtitle that can run to two lines when the text is long enough to wrap." onPress={() => undefined} />
      <ListRow title="Destructive row" destructive onPress={() => undefined} />
      <View style={{ height: 160 }}>
        <EmptyState title="Empty state" action={{ label: 'Action', onPress: () => undefined }} />
      </View>
      <View style={{ height: 160 }}>
        <ErrorState message="Error state, selectable for bug reports." onRetry={() => undefined} />
      </View>
    </Screen>
  );
}
