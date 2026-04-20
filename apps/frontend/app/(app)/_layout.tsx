import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/src/auth/useAuth';
import { colors } from '@/src/theme/colors';

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="search/index"
        options={{
          title: 'LandMatch',
          headerTitleStyle: { color: colors.accent, fontWeight: '700' },
        }}
      />
      <Stack.Screen
        name="report/index"
        options={{ title: 'Property Report' }}
      />
    </Stack>
  );
}
