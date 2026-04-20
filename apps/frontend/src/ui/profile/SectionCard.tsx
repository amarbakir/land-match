import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface SectionCardProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
}

export function SectionCard({ title, hint, children }: SectionCardProps) {
  return (
    <YStack
      backgroundColor={colors.cardBackground}
      borderWidth={1}
      borderColor={colors.borderSoft}
      borderRadius={8}
      padding={16}
      marginBottom={10}
    >
      <XStack justifyContent="space-between" alignItems="baseline" gap={12} marginBottom={8}>
        <Text fontSize={13} fontWeight="600" color={colors.textPrimary}>
          {title}
        </Text>
        {hint && (
          <Text
            fontFamily="$mono"
            fontSize={10.5}
            color={colors.textFaint}
            letterSpacing={0.4}
            textTransform="uppercase"
          >
            {hint}
          </Text>
        )}
      </XStack>
      {children}
    </YStack>
  );
}
