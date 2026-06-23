import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

export type DataRowVariant = 'default' | 'compact';

const variantStyles = {
  default: {
    labelSize: 13,
    labelColor: colors.textSecondary,
    valueSize: 13,
    valueWeight: '400',
    nullGlyph: '—',
    nullItalic: false,
  },
  compact: {
    labelSize: 12,
    labelColor: colors.textFaint,
    valueSize: 11.5,
    valueWeight: '500',
    nullGlyph: 'N/A',
    nullItalic: true,
  },
} as const;

interface DataRowProps {
  label: string;
  value: string | null;
  variant?: DataRowVariant;
  divider?: boolean;
}

export function DataRow({ label, value, variant = 'default', divider = false }: DataRowProps) {
  const style = variantStyles[variant];

  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      paddingVertical={4}
      {...(divider && { borderTopWidth: 1, borderTopColor: colors.borderSoft, borderStyle: 'dashed' as const })}
    >
      <Text fontSize={style.labelSize} color={style.labelColor}>
        {label}
      </Text>
      {value != null ? (
        <Text
          fontFamily="$mono"
          fontSize={style.valueSize}
          fontWeight={style.valueWeight}
          color={colors.textPrimary}
        >
          {value}
        </Text>
      ) : (
        <Text fontSize={style.valueSize} color={colors.textFaint} fontStyle={style.nullItalic ? 'italic' : 'normal'}>
          {style.nullGlyph}
        </Text>
      )}
    </XStack>
  );
}
