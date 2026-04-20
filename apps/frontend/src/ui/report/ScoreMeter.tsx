import { View } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';
import { scoreColor } from '@/src/ui/dashboard/ScoreRing';

interface ScoreMeterProps {
  label: string;
  score: number;
  weight?: number;
}

export function ScoreMeter({ label, score, weight }: ScoreMeterProps) {
  const color = scoreColor(score);

  return (
    <XStack alignItems="center" gap={8}>
      <XStack width={110} alignItems="baseline" gap={4}>
        <Text
          fontFamily="$mono"
          fontSize={11}
          textTransform="uppercase"
          color={colors.textFaint}
        >
          {label}
        </Text>
        {weight != null && weight !== 1.0 && (
          <Text fontFamily="$mono" fontSize={9} color={colors.textFaint}>
            x{weight}
          </Text>
        )}
      </XStack>
      <View style={{ flex: 1, height: 6, backgroundColor: colors.borderSoft, borderRadius: 3, overflow: 'hidden' }}>
        <View
          style={{
            width: `${Math.min(score, 100)}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      </View>
      <Text
        fontFamily="$mono"
        fontSize={12}
        color={color}
        width={42}
        textAlign="right"
      >
        {score}
      </Text>
    </XStack>
  );
}
