import { Pressable, ScrollView, View } from 'react-native';

import type { MatchItem, SearchProfileResponse } from '@landmatch/api';
import { Spinner, Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { EmptyState } from './EmptyState';
import { FilterChips, type FilterKey } from './FilterChips';
import { SlidersIcon } from './Icon';
import { MatchRow } from './MatchRow';

interface MatchListPaneProps {
  profile: SearchProfileResponse | null;
  matches: MatchItem[];
  total: number;
  selectedScoreId: string | null;
  filter: FilterKey;
  isLoading: boolean;
  shortlistedIds: Set<string>;
  counts: Record<FilterKey, number>;
  onSelectMatch: (match: MatchItem) => void;
  onFilterChange: (key: FilterKey) => void;
}

export function criteriaSummary(profile: SearchProfileResponse): string {
  const c = profile.criteria;
  const parts: string[] = [];
  if (c.acreage) {
    const min = c.acreage.min ?? 0;
    const max = c.acreage.max ?? '∞';
    parts.push(`${min}–${max} ac`);
  }
  if (c.price?.max) parts.push(`≤$${(c.price.max / 1000).toFixed(0)}K`);
  if (c.soilCapabilityClass?.max) {
    const labels = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    parts.push(`Class ≤${labels[c.soilCapabilityClass.max - 1] ?? c.soilCapabilityClass.max}`);
  }
  return parts.join(' · ') || 'No criteria set';
}

export function MatchListPane({
  profile,
  matches,
  total,
  selectedScoreId,
  filter,
  isLoading,
  shortlistedIds,
  counts,
  onSelectMatch,
  onFilterChange,
}: MatchListPaneProps) {
  return (
    <YStack
      width={400}
      minWidth={400}
      borderRightWidth={1}
      borderRightColor={colors.border}
      backgroundColor={colors.background}
    >
      {/* Profile picker header */}
      <XStack
        paddingHorizontal={16}
        paddingVertical={12}
        borderBottomWidth={1}
        borderBottomColor={colors.borderSoft}
        justifyContent="space-between"
        alignItems="center"
      >
        <YStack>
          <XStack alignItems="center" gap={4}>
            <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
              {profile?.name ?? 'Select a profile'}
            </Text>
            <Text fontSize={10} color={colors.textSecondary}>▾</Text>
          </XStack>
          {profile && (
            <XStack alignItems="center" gap={5} marginTop={2}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: profile.isActive ? colors.success : colors.textFaint,
                }}
              />
              <Text fontSize={10.5} color={colors.textSecondary}>
                {criteriaSummary(profile)}
              </Text>
            </XStack>
          )}
        </YStack>
        <Pressable style={{ padding: 6 }}>
          <SlidersIcon size={13} color={colors.textSecondary} />
        </Pressable>
      </XStack>

      {/* Filter chips */}
      <FilterChips active={filter} counts={counts} onSelect={onFilterChange} />

      {/* Match list */}
      {isLoading ? (
        <YStack flex={1} justifyContent="center" alignItems="center">
          <Spinner size="small" color={colors.accent} />
        </YStack>
      ) : matches.length === 0 ? (
        <EmptyState
          title="No matches"
          subtitle="Loosen a filter or expand this profile's criteria."
        />
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {matches.map((match) => (
            <MatchRow
              key={match.scoreId}
              match={match}
              selected={selectedScoreId === match.scoreId}
              shortlisted={shortlistedIds.has(match.scoreId)}
              onPress={() => onSelectMatch(match)}
            />
          ))}
        </ScrollView>
      )}
    </YStack>
  );
}
