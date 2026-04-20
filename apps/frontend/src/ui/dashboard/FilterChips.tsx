import { Pressable } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

export type FilterKey = 'all' | 'unread' | 'strong' | 'shortlist';

interface FilterChipsProps {
  active: FilterKey;
  counts: Record<FilterKey, number>;
  onSelect: (key: FilterKey) => void;
}

const CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'strong', label: '≥80' },
  { key: 'shortlist', label: '★' },
];

export function FilterChips({ active, counts, onSelect }: FilterChipsProps) {
  return (
    <XStack gap={5} paddingHorizontal={16} paddingVertical={8} borderBottomWidth={1} borderColor={colors.borderSoft}>
      {CHIPS.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <Pressable key={key} onPress={() => onSelect(key)}>
            <XStack
              backgroundColor={isActive ? colors.accent : 'transparent'}
              borderWidth={1}
              borderColor={isActive ? colors.accent : colors.border}
              paddingHorizontal={10}
              paddingVertical={3}
              borderRadius={10}
              gap={4}
              alignItems="center"
            >
              <Text
                fontFamily="$mono"
                fontSize={10}
                fontWeight={isActive ? '600' : '400'}
                color={isActive ? colors.background : colors.textSecondary}
              >
                {label}
              </Text>
              <Text
                fontFamily="$mono"
                fontSize={9}
                color={isActive ? colors.background : colors.textFaint}
                opacity={0.7}
              >
                {counts[key]}
              </Text>
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}
