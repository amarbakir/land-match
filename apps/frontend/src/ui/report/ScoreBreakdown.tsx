import type { MatchDetail } from '@landmatch/api';
import { Text, View, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';
import { scoreColor } from '@/src/ui/dashboard/ScoreRing';

import { ScoreMeter } from './ScoreMeter';
import { SectionHeader } from './SectionHeader';

interface ScoreBreakdownProps {
  match: MatchDetail;
}

const COMPONENT_ORDER: { key: keyof MatchDetail['componentScores']; label: string; weight: number }[] = [
  { key: 'soil', label: 'Soil', weight: 1.5 },
  { key: 'flood', label: 'Flood', weight: 2.0 },
  { key: 'price', label: 'Price', weight: 1.5 },
  { key: 'acreage', label: 'Acreage', weight: 1.0 },
  { key: 'zoning', label: 'Zoning', weight: 1.0 },
  { key: 'geography', label: 'Geography', weight: 1.0 },
  { key: 'infrastructure', label: 'Infra', weight: 0.5 },
  { key: 'climate', label: 'Climate', weight: 0.8 },
];

function tierLabel(score: number): string {
  if (score >= 85) return 'TOP MATCH';
  if (score >= 70) return 'STRONG MATCH';
  if (score >= 60) return 'GOOD MATCH';
  return 'WEAK MATCH';
}

function tierColor(score: number): string {
  if (score >= 70) return colors.success;
  if (score >= 60) return colors.accentSecondary;
  return colors.danger;
}

export function ScoreBreakdown({ match }: ScoreBreakdownProps) {
  const overall = match.overallScore;
  const color = tierColor(overall);

  return (
    <YStack gap={14}>
      <SectionHeader num="02" title="Score breakdown" annotation="WEIGHTED · /100" />
      <XStack gap={24}>
        {/* Overall score card */}
        <View
          width={200}
          backgroundColor={colors.cardBackground}
          borderWidth={1}
          borderColor={colors.borderSoft}
          borderRadius={8}
          padding={20}
          alignItems="center"
        >
          <Text fontFamily="$serif" fontSize={72} fontWeight="600" color={color}>
            {overall}
          </Text>
          <Text fontFamily="$mono" fontSize={10} color={colors.textFaint} textTransform="uppercase">
            Overall
          </Text>
          <View
            marginTop={8}
            paddingTop={8}
            borderTopWidth={1}
            borderTopColor={colors.borderSoft}
            width="100%"
            alignItems="center"
          >
            <Text fontFamily="$mono" fontSize={11} color={color} textTransform="uppercase">
              {tierLabel(overall)}
            </Text>
          </View>
        </View>

        {/* Score meters */}
        <YStack flex={1} gap={10} justifyContent="center">
          {COMPONENT_ORDER.map(({ key, label, weight }) => (
            <ScoreMeter
              key={key}
              label={label}
              score={match.componentScores[key]}
              weight={weight}
            />
          ))}
        </YStack>
      </XStack>
    </YStack>
  );
}
