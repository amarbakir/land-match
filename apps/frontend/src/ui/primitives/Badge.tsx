import { Text, XStack, XStackProps } from 'tamagui';

import { colors } from '../../theme/colors';

export interface BadgeProps extends XStackProps {
  text: string;
}

export function Badge({ text, ...props }: BadgeProps) {
  return (
    <XStack
      backgroundColor={colors.border}
      paddingHorizontal="$2"
      paddingVertical={3}
      borderRadius={12}
      {...props}
    >
      <Text fontSize={11} fontWeight="600" color={colors.accent}>
        {text}
      </Text>
    </XStack>
  );
}
