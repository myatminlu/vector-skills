import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n/provider';
import { getApiErrorMessage } from '@/lib/api';
import { withAccount } from '@/modules/account-gate';
import { slots } from '@/modules/slots';
import { streamAnswer } from '@/modules/streaming/api';

/**
 * A streamed answer — and, when the modules are installed, account-only (guest) and consent-gated (ai-consent): the
 * hardest patterns of an AI feature in one small screen. Copy the shape, not the UI — every path that sends the
 * user's words goes through `slots.withConsent` first.
 */
function AskScreen() {
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const { t } = useI18n();
  const user = slots.useSessionUser();
  const enabled = slots.useFlag('ask.enabled', true);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [state, setState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = (text: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setAnswer('');
    setError(null);
    setState('streaming');
    streamAnswer(
      { question: text, itemId },
      (event) => {
        if (event.type === 'delta') setAnswer((current) => current + event.text);
      },
      controller.signal,
    )
      .then(() => setState('done'))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(getApiErrorMessage(reason));
        setState('error');
      });
  };

  const send = () => {
    const text = question.trim();
    if (!text || state === 'streaming') return;
    if (user) slots.withConsent(user.id, () => start(text));
    else start(text);
  };

  if (!enabled) {
    return (
      <Screen>
        <AppText variant="body" tone="muted">
          {t('ask_disabled')}
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen keyboard testID="ask-screen" footer={<Button testID="ask-send" label={t('ask_send')} onPress={send} loading={state === 'streaming'} disabled={!question.trim()} />}>
      <FormField testID="ask-input" label={t('ask_title')} placeholder={t('ask_placeholder')} value={question} onChangeText={setQuestion} multiline />
      <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
        {state === 'streaming' && !answer ? (
          <AppText variant="body" tone="muted">
            {t('ask_thinking')}
          </AppText>
        ) : null}
        {answer ? (
          <AppText testID="ask-answer" variant="reading" selectable>
            {answer}
          </AppText>
        ) : null}
        {error ? (
          <AppText variant="footnote" tone="danger" accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

export default withAccount(AskScreen, 'ask');
