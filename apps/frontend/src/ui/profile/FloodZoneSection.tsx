import { Switch } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { SectionCard } from './SectionCard';
import { ToggleButtonRow, toggleValue } from './ToggleButtonRow';

const FLOOD_OPTIONS = [
  { value: 'X', label: 'Zone X' },
  { value: 'A', label: 'Zone A' },
  { value: 'AE', label: 'Zone AE' },
  { value: 'VE', label: 'Zone VE' },
  { value: 'D', label: 'Zone D' },
];

interface FloodZoneSectionProps {
  excluded: string[];
  includeUnverified: boolean;
  onChange: (excluded: string[]) => void;
  onIncludeUnverifiedChange: (value: boolean) => void;
}

export function FloodZoneSection({
  excluded,
  includeUnverified,
  onChange,
  onIncludeUnverifiedChange,
}: FloodZoneSectionProps) {
  return (
    <SectionCard title="Exclude flood zones" hint="HARD FILTER">
      <ToggleButtonRow
        options={FLOOD_OPTIONS}
        selected={excluded}
        onToggle={(v) => {
          const next = toggleValue(excluded, v);
          // The opt-in is scoped to the exclusion selection: clearing the
          // last exclusion resets it, so re-adding a zone later starts from
          // fail-closed instead of a forgotten latent true (the server
          // strips it at the write boundary too — this keeps the editor's
          // visible state in sync within the session).
          if (next.length === 0 && includeUnverified) {
            onIncludeUnverifiedChange(false);
          }
          onChange(next);
        }}
        variant="danger"
      />
      {excluded.length > 0 && (
        <XStack alignItems="center" justifyContent="space-between" gap={12} marginTop={12}>
          <YStack flex={1} gap={2}>
            <Text fontSize={12.5} color={colors.textPrimary}>
              Include unverified flood zones
            </Text>
            <Text fontSize={10.5} color={colors.textSecondary}>
              Show listings where FEMA flood data is unavailable — common in rural counties.
              They appear with a "Flood unverified" badge.
            </Text>
          </YStack>
          <Switch
            value={includeUnverified}
            onValueChange={onIncludeUnverifiedChange}
            trackColor={{ false: colors.borderSoft, true: colors.success }}
            thumbColor={colors.textPrimary}
          />
        </XStack>
      )}
    </SectionCard>
  );
}
