import { Redirect, Slot } from 'expo-router';
import { Spinner, YStack } from 'tamagui';

import { useAuth } from '@/src/auth/useAuth';
import { colors } from '@/src/theme/colors';

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor={colors.background}>
        <Spinner size="large" color={colors.accent} />
      </YStack>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Slot />;
}
