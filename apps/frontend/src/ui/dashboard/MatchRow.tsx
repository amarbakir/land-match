import { Pressable, View } from 'react-native';

import type { MatchItem } from '@landmatch/api';
import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { ScoreRing } from './ScoreRing';
import { Tag } from './Tag';
import type { TagTone } from './Tag';

interface MatchRowProps {
  match: MatchItem;
  selected: boolean;
  shortlisted: boolean;
  onPress: () => void;
}

export function formatPrice(price: number | null): string {
  if (price == null) return '—';
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  return `$${(price / 1000).toFixed(0)}K`;
}

export function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function deriveTags(match: MatchItem): { label: string; tone: TagTone }[] {
  const tags: { label: string; tone: TagTone }[] = [];
  if (match.floodZone === 'X') tags.push({ label: 'Zone X', tone: 'green' });
  else if (match.floodZone) tags.push({ label: `Zone ${match.floodZone}`, tone: match.floodZone === 'A' || match.floodZone === 'AE' ? 'clay' : 'default' });
  if (match.primeFarmland) tags.push({ label: 'Prime Soil', tone: 'gold' });
  else if (match.soilClassLabel) tags.push({ label: match.soilClassLabel, tone: 'default' });
  return tags.slice(0, 3);
}

export function MatchRow({ match, selected, shortlisted, onPress }: MatchRowProps) {
  const isUnread = !match.readAt;
  const tags = deriveTags(match);

  return (
    <Pressable onPress={onPress}>
      <XStack
        backgroundColor={selected ? colors.cardBackground : 'transparent'}
        borderLeftWidth={selected ? 3 : 0}
        borderLeftColor={selected ? colors.accent : 'transparent'}
        paddingLeft={selected ? 13 : 16}
        paddingRight={16}
        paddingVertical={10}
        borderBottomWidth={1}
        borderBottomColor={colors.borderSoft}
        gap={10}
        alignItems="flex-start"
        opacity={isUnread ? 1 : 0.65}
      >
        {/* Score ring with unread dot */}
        <View style={{ position: 'relative' }}>
          <ScoreRing score={match.overallScore} size={40} />
          {isUnread && (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.accent,
                borderWidth: 2,
                borderColor: colors.background,
              }}
            />
          )}
        </View>

        {/* Body */}
        <YStack flex={1} gap={2}>
          <Text
            fontSize={12.5}
            fontWeight={isUnread ? '700' : '500'}
            color={colors.textPrimary}
            numberOfLines={1}
          >
            {shortlisted && (
              <Text color={colors.accent} fontSize={11}>★ </Text>
            )}
            {match.title ?? match.address}
          </Text>

          <XStack gap={4}>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {formatPrice(match.price)}
            </Text>
            <Text fontSize={10.5} color={colors.textFaint}>·</Text>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {match.acreage ?? '—'}ac
            </Text>
            <Text fontSize={10.5} color={colors.textFaint}>·</Text>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {match.source ?? '—'}
            </Text>
          </XStack>

          {match.llmSummary && (
            <Text fontSize={11} color={colors.textFaint} numberOfLines={2} lineHeight={15.4}>
              {match.llmSummary}
            </Text>
          )}

          {tags.length > 0 && (
            <XStack gap={4} marginTop={3} flexWrap="wrap">
              {tags.map((t) => (
                <Tag key={t.label} label={t.label} tone={t.tone} />
              ))}
            </XStack>
          )}
        </YStack>

        {/* Time */}
        <Text fontFamily="$mono" fontSize={9.5} color={colors.textFaint}>
          {formatTime(match.scoredAt)}
        </Text>
      </XStack>
    </Pressable>
  );
}
