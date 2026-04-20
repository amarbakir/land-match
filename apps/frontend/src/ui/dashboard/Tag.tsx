import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

export type TagTone = 'default' | 'green' | 'gold' | 'clay';

const toneColors: Record<TagTone, string> = {
  default: colors.textSecondary,
  green: colors.success,
  gold: colors.accent,
  clay: colors.accentSecondary,
};

interface TagProps {
  label: string;
  tone?: TagTone;
}

export function Tag({ label, tone = 'default' }: TagProps) {
  return (
    <XStack
      backgroundColor={colors.cardAlt}
      paddingHorizontal={6}
      paddingVertical={1}
      borderRadius={3}
    >
      <Text
        fontFamily="$mono"
        fontSize={9}
        textTransform="uppercase"
        letterSpacing={0.4}
        color={toneColors[tone]}
      >
        {label}
      </Text>
    </XStack>
  );
}
