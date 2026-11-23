import { useLocalSearchParams } from 'expo-router';

import { accountFeatureFrom, LoginRequiredSheet } from '@/features/guest/require-account';

export default function LoginRequiredRoute() {
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  return <LoginRequiredSheet feature={accountFeatureFrom(feature)} />;
}
