import { Pressable, ScrollView } from 'react-native';

import type { MatchItem } from '@landmatch/api';
import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { EmptyState } from './EmptyState';
import { formatPrice } from './MatchRow';
import { ScoreRing } from './ScoreRing';

interface ShortlistViewProps {
  matches: MatchItem[];
  dismissed?: boolean;
  onOpenMatch: (match: MatchItem) => void;
}

export function ShortlistView({ matches, dismissed, onOpenMatch }: ShortlistViewProps) {
  if (matches.length === 0) {
    return (
      <EmptyState
        title={dismissed ? 'Nothing dismissed' : 'No shortlisted properties yet'}
        subtitle={
          dismissed
            ? 'Properties you archive from the inbox show up here.'
            : 'Star a property in the inbox to save it here.'
        }
      />
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
      <Text fontFamily="$mono" fontSize={10} textTransform="uppercase" letterSpacing={1} color={colors.textFaint}>
        {dismissed ? 'Dismissed' : 'Shortlist'}
      </Text>
      <Text fontFamily="$serif" fontSize={20} fontWeight="600" color={colors.textPrimary} marginTop={4}>
        {dismissed ? 'Dismissed properties' : 'Your shortlisted properties'}
      </Text>
      <Text fontSize={13} color={colors.textSecondary} marginTop={4} marginBottom={20}>
        {matches.length} {matches.length === 1 ? 'property' : 'properties'}.
      </Text>

      <XStack flexWrap="wrap" gap={12}>
        {matches.map((m) => (
          <Pressable key={m.scoreId} onPress={() => onOpenMatch(m)} style={{ width: 300 }}>
            <YStack
              backgroundColor={colors.cardBackground}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius={8}
              padding={16}
              gap={8}
            >
              <XStack justifyContent="space-between" alignItems="flex-start">
                <YStack flex={1} marginRight={8}>
                  <Text fontSize={13} fontWeight="600" color={colors.textPrimary} numberOfLines={1}>
                    {m.title ?? m.address}
                  </Text>
                  <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary} marginTop={2}>
                    {formatPrice(m.price)} · {m.acreage ?? '—'}ac · {m.source ?? '—'}
                  </Text>
                </YStack>
                <ScoreRing score={m.overallScore} size={40} />
              </XStack>

              {m.llmSummary && (
                <Text fontSize={12} color={colors.textSecondary} lineHeight={18} numberOfLines={3}>
                  {m.llmSummary}
                </Text>
              )}

              <XStack justifyContent="space-between">
                <Text fontFamily="$mono" fontSize={9.5} color={colors.textFaint}>
                  {m.soilClassLabel ?? '—'} · Zone {m.floodZone ?? '—'}
                </Text>
              </XStack>
            </YStack>
          </Pressable>
        ))}
      </XStack>
    </ScrollView>
  );
}
