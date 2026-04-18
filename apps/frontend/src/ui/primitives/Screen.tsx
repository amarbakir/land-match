import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, YStackProps } from 'tamagui';

import { colors } from '../../theme/colors';

export interface ScreenProps extends YStackProps {
  children: React.ReactNode;
}

export function Screen({ children, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <YStack
      flex={1}
      backgroundColor={colors.background}
      paddingTop={insets.top}
      paddingBottom={insets.bottom}
      paddingLeft={insets.left}
      paddingRight={insets.right}
      {...props}
    >
      {children}
    </YStack>
  );
}
