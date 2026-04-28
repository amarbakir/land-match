import { LoginRequest } from '@landmatch/api';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Input, Spinner, Text, XStack, YStack } from 'tamagui';

import { Eye, EyeOff } from '@tamagui/lucide-icons';

import { useAuth } from '@/src/auth/useAuth';
import { colors } from '@/src/theme/colors';
import { Button } from '@/src/ui/primitives/Button';
import { Screen } from '@/src/ui/primitives/Screen';
import { inputStyles } from '@/src/ui/primitives/inputStyles';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    setError(null);

    const parsed = LoginRequest.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      await login(parsed.data);
      router.replace('/(app)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen justifyContent="center" padding="$6">
      <YStack gap="$4" maxWidth={400} width="100%" alignSelf="center">
        <Text fontSize="$8" fontWeight="700" color={colors.accent} textAlign="center">
          LandMatch
        </Text>
        <Text fontSize="$4" color={colors.textSecondary} textAlign="center" marginBottom="$4">
          Sign in to your account
        </Text>

        <Input
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          {...inputStyles}
        />
        <XStack alignItems="center" position="relative">
          <Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            flex={1}
            paddingRight="$8"
            {...inputStyles}
          />
          <XStack
            position="absolute"
            right="$3"
            onPress={() => setShowPassword(!showPassword)}
            cursor="pointer"
            padding="$1"
          >
            {showPassword ? (
              <EyeOff size={20} color={colors.textSecondary} />
            ) : (
              <Eye size={20} color={colors.textSecondary} />
            )}
          </XStack>
        </XStack>

        {error && (
          <Text color={colors.danger} fontSize="$3" textAlign="center">
            {error}
          </Text>
        )}

        <Button onPress={handleLogin} disabled={loading}>
          {loading ? <Spinner color={colors.background} /> : 'Sign In'}
        </Button>

        <Link href="/register" asChild>
          <Text color={colors.accent} textAlign="center" fontSize="$3" marginTop="$2">
            Don't have an account? Register
          </Text>
        </Link>
      </YStack>
    </Screen>
  );
}
