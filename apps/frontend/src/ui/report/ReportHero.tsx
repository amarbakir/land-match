import { Linking, Pressable } from 'react-native';

import type { MatchDetail } from '@landmatch/api';
import { Text, View, XStack, YStack } from 'tamagui';

import { useUpdateMatchStatus } from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';
import { formatPrice, formatTime } from '@/src/ui/dashboard/MatchRow';

interface ReportHeroProps {
  match: MatchDetail;
}

function GhostButton({
  label,
  active,
  onPress,
  marginLeft,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  marginLeft?: 'auto';
}) {
  return (
    <Pressable onPress={onPress}>
      <View
        paddingHorizontal={14}
        paddingVertical={7}
        borderRadius={8}
        borderWidth={1}
        borderColor={active ? colors.accent : colors.borderSoft}
        backgroundColor={active ? `${colors.accent}18` : 'transparent'}
        {...(marginLeft ? { marginLeft } : {})}
      >
        <Text fontSize={12.5} color={active ? colors.accent : colors.textSecondary}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function ReportHero({ match }: ReportHeroProps) {
  const updateStatus = useUpdateMatchStatus();
  const isShortlisted = match.status === 'shortlisted';
  const isDismissed = match.status === 'dismissed';
  const pricePerAcre =
    match.price != null && match.acreage != null && match.acreage > 0
      ? Math.round(match.price / match.acreage)
      : null;

  const handleShortlist = () => {
    updateStatus.mutate({
      scoreId: match.scoreId,
      data: { status: isShortlisted ? 'inbox' : 'shortlisted' },
    });
  };

  const handleDismiss = () => {
    updateStatus.mutate({
      scoreId: match.scoreId,
      data: { status: isDismissed ? 'inbox' : 'dismissed' },
    });
  };

  return (
    <XStack gap={32} paddingBottom={24} borderBottomWidth={1} borderBottomColor={colors.borderSoft}>
      <YStack flex={1} gap={8}>
        {/* Eyebrow */}
        <XStack alignItems="center" gap={8}>
          <View width={16} height={1} backgroundColor={colors.accent} />
          <Text
            fontFamily="$mono"
            fontSize={10.5}
            color={colors.accent}
            textTransform="uppercase"
            letterSpacing={0.14 * 10.5}
          >
            {match.source ?? 'Unknown'} · Found {formatTime(match.scoredAt)} ago
          </Text>
        </XStack>

        {/* Title */}
        <Text fontFamily="$serif" fontSize={30} fontWeight="600" lineHeight={33} color={colors.textPrimary}>
          {match.title ?? match.address}
        </Text>

        {/* Address */}
        {match.title && (
          <Text fontFamily="$mono" fontSize={12} color={colors.textFaint}>
            {match.address}
          </Text>
        )}

        {/* Action buttons */}
        <XStack gap={8} flexWrap="wrap" marginTop={4}>
          <Pressable onPress={() => match.url && Linking.openURL(match.url)}>
            <View
              paddingHorizontal={14}
              paddingVertical={7}
              borderRadius={8}
              backgroundColor={colors.accent}
            >
              <Text fontSize={12.5} color={colors.backgroundDeep} fontWeight="600">
                Open on {match.source ?? 'source'}
              </Text>
            </View>
          </Pressable>
          <GhostButton
            label={isShortlisted ? 'Shortlisted' : 'Shortlist'}
            active={isShortlisted}
            onPress={handleShortlist}
          />
          <GhostButton label="Add note" />
          <GhostButton label="Share" />
          <GhostButton
            label={isDismissed ? 'Dismissed' : 'Dismiss'}
            active={isDismissed}
            onPress={handleDismiss}
            marginLeft="auto"
          />
        </XStack>
      </YStack>

      {/* Right column: price */}
      <YStack alignItems="flex-end" gap={4}>
        <Text fontFamily="$serif" fontSize={28} fontWeight="600" color={colors.textPrimary}>
          {formatPrice(match.price)}
        </Text>
        {pricePerAcre != null && (
          <Text fontFamily="$mono" fontSize={10.5} color={colors.textFaint} textTransform="uppercase">
            ASKING · ${pricePerAcre.toLocaleString()}/AC
          </Text>
        )}
      </YStack>
    </XStack>
  );
}
