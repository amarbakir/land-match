import { Text, View, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface SectionHeaderProps {
  num: string;
  title: string;
  annotation?: string;
}

export function SectionHeader({ num, title, annotation }: SectionHeaderProps) {
  return (
    <XStack alignItems="center" gap={12}>
      <Text fontFamily="$mono" fontSize={10} color={colors.textFaint} letterSpacing={0.14 * 10}>
        {num}
      </Text>
      <Text fontFamily="$serif" fontSize={16} fontWeight="600" color={colors.textPrimary}>
        {title}
      </Text>
      <View flex={1} height={1} backgroundColor={colors.borderSoft} />
      {annotation && (
        <Text
          fontFamily="$mono"
          fontSize={10}
          color={colors.textFaint}
          letterSpacing={0.1 * 10}
          textTransform="uppercase"
        >
          {annotation}
        </Text>
      )}
    </XStack>
  );
}
