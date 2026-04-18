import { ButtonProps, Button as TamaguiButton } from 'tamagui';

import { colors } from '../../theme/colors';

export interface LandMatchButtonProps extends Omit<ButtonProps, 'variant'> {
  buttonVariant?: 'primary' | 'secondary' | 'outline';
}

export function Button({ buttonVariant = 'primary', children, ...props }: LandMatchButtonProps) {
  const variantStyles = {
    primary: {
      backgroundColor: colors.accent,
      color: colors.background,
      borderWidth: 0,
    },
    secondary: {
      backgroundColor: colors.cardBackground,
      color: colors.textPrimary,
      borderWidth: 0,
    },
    outline: {
      backgroundColor: 'transparent',
      color: colors.accent,
      borderWidth: 1,
      borderColor: colors.accent,
    },
  };

  return (
    <TamaguiButton
      minHeight={44}
      borderRadius="$4"
      {...variantStyles[buttonVariant]}
      {...props}
    >
      {children}
    </TamaguiButton>
  );
}
