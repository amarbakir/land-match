import Svg, { Circle, Path } from 'react-native-svg';
import { Text, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
}

export function EmptyState({
  title = 'Nothing here yet',
  subtitle = 'Your matches will show up here as they come in.',
}: EmptyStateProps) {
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" gap={10} padding={40}>
      <Svg width={120} height={120} viewBox="0 0 160 160" fill="none" opacity={0.4}>
        <Circle cx={80} cy={80} r={60} stroke="#2C3E2D" strokeWidth={1.5} strokeDasharray="3 4" />
        <Path d="M40,95 Q70,70 100,85 T140,80" stroke="#3a5040" strokeWidth={1.2} />
        <Path d="M30,110 Q70,85 110,100 T150,95" stroke="#3a5040" strokeWidth={1.2} />
        <Circle cx={80} cy={80} r={4} fill={colors.accent} />
      </Svg>
      <Text fontFamily="$serif" fontSize={20} fontWeight="600" color={colors.textPrimary}>
        {title}
      </Text>
      <Text fontSize={13} color={colors.textSecondary} textAlign="center" maxWidth={320}>
        {subtitle}
      </Text>
    </YStack>
  );
}
