import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n/provider';

import { textSize, useTextSize } from './store';
import { TEXT_SIZES } from './text-size';

export function TextSizeSection() {
  const { t } = useI18n();
  const size = useTextSize();
  return (
    <View style={{ gap: Spacing.sm }}>
      <AppText variant="footnote" tone="muted">
        {t('account_text_size')}
      </AppText>
      <Segmented testIDPrefix="text-size" label={t('account_text_size')} value={size} onChange={textSize.set} options={TEXT_SIZES.map((value) => ({ value, label: `${value}%` }))} />
    </View>
  );
}
