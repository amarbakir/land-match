import { useEffect, useState } from 'react';

import { Spinner, Text, YStack } from 'tamagui';

import type { AlertChannel } from '@landmatch/api';

import { useNotificationPrefs, useUpdateNotificationPrefs } from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';
import { Button } from '@/src/ui/primitives/Button';
import { SectionCard } from '@/src/ui/profile/SectionCard';
import { ToggleButtonRow, toggleValue } from '@/src/ui/profile/ToggleButtonRow';

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
];

export function AlertSettingsScreen() {
  const { data, isLoading } = useNotificationPrefs();
  const mutation = useUpdateNotificationPrefs();
  const [channels, setChannels] = useState<AlertChannel[]>(['email']);

  useEffect(() => {
    if (data?.alertChannels) {
      setChannels(data.alertChannels);
    }
  }, [data]);

  const handleToggle = (value: string) => {
    const next = toggleValue(channels, value);
    if (next.length === 0) return;
    setChannels(next as AlertChannel[]);
  };

  const handleSave = () => {
    mutation.mutate({ alertChannels: channels });
  };

  if (isLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Spinner size="large" />
      </YStack>
    );
  }

  return (
    <YStack flex={1} padding={24} alignItems="center">
      <YStack width="100%" maxWidth={480} gap={16}>
        <Text fontSize={18} fontWeight="600" color={colors.textPrimary}>
          Alert settings
        </Text>

        <SectionCard title="Alert channels" hint="at least 1 required">
          <ToggleButtonRow
            options={CHANNEL_OPTIONS}
            selected={channels}
            onToggle={handleToggle}
          />
        </SectionCard>

        {mutation.isError && (
          <Text fontSize={12} color={colors.danger}>
            {mutation.error?.message ?? 'Failed to save preferences'}
          </Text>
        )}

        <Button
          buttonVariant="primary"
          onPress={handleSave}
          disabled={mutation.isPending}
          opacity={mutation.isPending ? 0.5 : 1}
        >
          <Text fontWeight="600" color={colors.background}>
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Text>
        </Button>
      </YStack>
    </YStack>
  );
}
