import { Pressable } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { SectionCard } from './SectionCard';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;

interface SoilSectionProps {
  maxClass: number;
  onChange: (maxClass: number) => void;
}

export function SoilSection({ maxClass, onChange }: SoilSectionProps) {
  return (
    <SectionCard title="Soil capability class" hint={`MAX CLASS ${ROMAN[maxClass - 1] ?? 'III'}`}>
      <XStack flexWrap="wrap" gap={6}>
        {ROMAN.map((label, i) => {
          const classNum = i + 1;
          const isSelected = classNum <= maxClass;
          return (
            <Pressable key={label} onPress={() => onChange(classNum)}>
              <Text
                fontFamily="$mono"
                fontSize={12}
                letterSpacing={0.2}
                paddingVertical={5}
                paddingHorizontal={11}
                borderRadius={99}
                borderWidth={1}
                overflow="hidden"
                backgroundColor={isSelected ? colors.accentBg : 'transparent'}
                borderColor={isSelected ? colors.accentBorder : colors.borderSoft}
                color={isSelected ? colors.accent : colors.textSecondary}
              >
                Class {label}
              </Text>
            </Pressable>
          );
        })}
      </XStack>
    </SectionCard>
  );
}
