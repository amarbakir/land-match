import type { MatchDetail } from '@landmatch/api';
import { Text, View, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';
import { deriveTags } from '@/src/ui/dashboard/MatchRow';
import { Tag } from '@/src/ui/dashboard/Tag';

import { SectionHeader } from './SectionHeader';

interface VerdictSectionProps {
  match: MatchDetail;
}

export function VerdictSection({ match }: VerdictSectionProps) {
  const tags = deriveTags(match);

  return (
    <YStack gap={14}>
      <SectionHeader num="01" title="AI Verdict" annotation="CLAUDE HAIKU" />
      <View
        backgroundColor={colors.cardBackground}
        borderWidth={1}
        borderColor={colors.borderSoft}
        borderLeftWidth={3}
        borderLeftColor={colors.accent}
        borderRadius={8}
        paddingHorizontal={18}
        paddingVertical={16}
      >
        <Text fontFamily="$serif" fontSize={16} lineHeight={24.8} color={colors.textPrimary}>
          {match.llmSummary ?? 'No AI summary available for this property.'}
        </Text>
        {tags.length > 0 && (
          <XStack gap={6} marginTop={10} flexWrap="wrap">
            {tags.map((t) => (
              <Tag key={t.label} label={t.label} tone={t.tone} />
            ))}
          </XStack>
        )}
      </View>
    </YStack>
  );
}
