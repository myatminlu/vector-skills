import { useLocalSearchParams } from 'expo-router';

import { LoginRequiredSheet } from '@/modules/guest/require-account';

export default function LoginRequiredRoute() {
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  return <LoginRequiredSheet feature={feature ?? 'account'} />;
}
