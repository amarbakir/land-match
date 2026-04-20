import { RegisterRequest, type RegisterRequestType } from '@landmatch/api';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Input, Spinner, Text, YStack } from 'tamagui';

import { useAuth } from '@/src/auth/useAuth';
import { colors } from '@/src/theme/colors';
import { Button } from '@/src/ui/primitives/Button';
import { Screen } from '@/src/ui/primitives/Screen';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setError(null);

    const data = { email, password, ...(name ? { name } : {}) };
    const parsed = RegisterRequest.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      await register(parsed.data as RegisterRequestType);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
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
          Create your account
        </Text>

        <Input
          placeholder="Name (optional)"
          value={name}
          onChangeText={setName}
          backgroundColor={colors.cardBackground}
          color={colors.textPrimary}
          borderColor={colors.border}
          placeholderTextColor={colors.textSecondary}
        />
        <Input
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          backgroundColor={colors.cardBackground}
          color={colors.textPrimary}
          borderColor={colors.border}
          placeholderTextColor={colors.textSecondary}
        />
        <Input
          placeholder="Password (min 8 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          backgroundColor={colors.cardBackground}
          color={colors.textPrimary}
          borderColor={colors.border}
          placeholderTextColor={colors.textSecondary}
        />

        {error && (
          <Text color={colors.danger} fontSize="$3" textAlign="center">
            {error}
          </Text>
        )}

        <Button onPress={handleRegister} disabled={loading}>
          {loading ? <Spinner color={colors.background} /> : 'Create Account'}
        </Button>

        <Link href="/login" asChild>
          <Text color={colors.accent} textAlign="center" fontSize="$3" marginTop="$2">
            Already have an account? Sign in
          </Text>
        </Link>
      </YStack>
    </Screen>
  );
}
