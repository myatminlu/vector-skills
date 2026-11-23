import { Stack } from 'expo-router';

/**
 * The anchor matters: when the app opens signed out, the initial URL (`/`) points into the protected app group, and
 * the router falls back to this group — without an anchor it has no screen to land on and shows "not found".
 */
export const unstable_settings = { anchor: 'sign-in' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
