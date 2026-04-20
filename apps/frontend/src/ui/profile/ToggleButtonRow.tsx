import { Pressable } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface ToggleOption {
  value: string;
  label: string;
}

interface ToggleButtonRowProps {
  options: ToggleOption[];
  selected: string[];
  onToggle: (value: string) => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

export function ToggleButtonRow({
  options,
  selected,
  onToggle,
  variant = 'default',
  disabled = false,
}: ToggleButtonRowProps) {
  const activeBackground = variant === 'danger'
    ? 'rgba(220,38,38,0.1)'
    : 'rgba(212,168,67,0.1)';
  const activeBorder = variant === 'danger'
    ? 'rgba(220,38,38,0.3)'
    : 'rgba(212,168,67,0.3)';
  const activeText = variant === 'danger' ? colors.danger : colors.accent;

  return (
    <XStack flexWrap="wrap" gap={6}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onToggle(opt.value)}
            style={{ opacity: disabled ? 0.4 : 1 }}
          >
            <Text
              fontFamily="$mono"
              fontSize={12}
              letterSpacing={0.2}
              paddingVertical={5}
              paddingHorizontal={11}
              borderRadius={99}
              borderWidth={1}
              overflow="hidden"
              backgroundColor={isSelected ? activeBackground : 'transparent'}
              borderColor={isSelected ? activeBorder : colors.borderSoft}
              color={isSelected ? activeText : colors.textSecondary}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** Helper: toggle a value in/out of a string array */
export function toggleValue(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}
