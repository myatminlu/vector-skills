import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { i18n } from '@/i18n';

type State = { error: Error | null };

/**
 * Last line of defence for render errors. It does not catch errors thrown outside render (event handlers, timers,
 * promises) — a crash reporter does. Wire one (Sentry, Crashlytics) in `componentDidCatch` and the global handler
 * before the first store release, and declare it in both stores' privacy forms.
 */
export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Report to the crash reporter here.
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xxxl }}>
        <AppText variant="title" align="center">
          {i18n.t('err_boundary_title')}
        </AppText>
        <AppText variant="body" tone="muted" align="center">
          {i18n.t('err_boundary_body')}
        </AppText>
        {__DEV__ ? (
          <AppText variant="caption" tone="faint" selectable align="center">
            {this.state.error.message}
          </AppText>
        ) : null}
        <Button label={i18n.t('common_retry')} onPress={this.reset} size="sm" />
      </View>
    );
  }
}
