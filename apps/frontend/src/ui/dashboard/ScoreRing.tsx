import { View } from 'react-native';

import Svg, { Circle } from 'react-native-svg';
import { Text } from 'tamagui';

import { colors } from '@/src/theme/colors';

export function scoreColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.accentSecondary;
  if (score >= 40) return colors.accent;
  return colors.danger;
}

interface ScoreRingProps {
  score: number;
  size?: number;
}

export function ScoreRing({ score, size = 40 }: ScoreRingProps) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;
  const color = scoreColor(score);

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.borderSoft}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text fontSize={size * 0.3} fontWeight="700" color={color}>
          {score}
        </Text>
      </View>
    </View>
  );
}
