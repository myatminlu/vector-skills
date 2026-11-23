import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useI18n } from '@/i18n/provider';
import { getSignInErrorMessage } from '@/modules/auth/errors';
import { useAuth } from '@/modules/auth/session';
import { registry } from '@/modules/slots';

export default function SignInScreen() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const extras = registry.signInFooter();

  const submit = async () => {
    const next = { email: email.trim() ? undefined : t('auth_email_required'), password: password ? undefined : t('auth_password_required') };
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    try {
      // On success the root layout swaps this stack for the app; nothing to navigate here.
      await signIn({ email: email.trim(), password });
    } catch (error) {
      setErrors({ form: getSignInErrorMessage(error) });
      setBusy(false);
    }
  };

  return (
    <Screen
      topInset
      keyboard
      width="form"
      testID="sign-in-screen"
      contentStyle={{ justifyContent: 'center', gap: Spacing.lg }}
      footer={
        <>
          <Button testID="sign-in-submit" label={t('auth_sign_in')} onPress={submit} loading={busy} />
          {extras.map((extra) => (
            <extra.Component key={extra.id} busy={busy} />
          ))}
        </>
      }>
      <View style={{ gap: Spacing.xs }}>
        <AppText variant="largeTitle" accessibilityRole="header">
          {t('auth_title')}
        </AppText>
        <AppText variant="body" tone="muted">
          {t('auth_subtitle')}
        </AppText>
      </View>
      <FormField
        testID="sign-in-email"
        label={t('auth_email')}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <FormField
        testID="sign-in-password"
        label={t('auth_password')}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {errors.form ? (
        <AppText testID="sign-in-error" variant="footnote" tone="danger" accessibilityRole="alert">
          {errors.form}
        </AppText>
      ) : null}
    </Screen>
  );
}
