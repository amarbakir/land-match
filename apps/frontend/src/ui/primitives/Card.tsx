import { YStack, YStackProps } from 'tamagui';

import { colors } from '../../theme/colors';

export interface CardProps extends YStackProps {
  children: React.ReactNode;
}

export function Card({ children, ...props }: CardProps) {
  return (
    <YStack
      backgroundColor={colors.cardBackground}
      borderRadius="$4"
      padding="$4"
      borderWidth={1}
      borderColor={colors.border}
      {...props}
    >
      {children}
    </YStack>
  );
}
