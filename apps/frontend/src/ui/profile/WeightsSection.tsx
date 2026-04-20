import { Pressable, View } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { SectionCard } from './SectionCard';

const WEIGHT_KEYS = [
  'flood', 'soil', 'price', 'acreage',
  'zoning', 'geography', 'climate', 'infrastructure',
] as const;

interface WeightsSectionProps {
  weights: Record<string, number>;
  onChange: (weights: Record<string, number>) => void;
}

export function WeightsSection({ weights, onChange }: WeightsSectionProps) {
  const handleBarPress = (
    key: string,
    e: { nativeEvent: { locationX: number } },
    width: number,
  ) => {
    if (width <= 0) return;
    const raw = (e.nativeEvent.locationX / width) * 2;
    const snapped = Math.round(raw * 10) / 10;
    const clamped = Math.max(0, Math.min(2, snapped));
    onChange({ ...weights, [key]: clamped });
  };

  return (
    <SectionCard title="Custom weights" hint="0 – 2.0">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {WEIGHT_KEYS.map((key) => {
          const value = weights[key] ?? 1.0;
          const fraction = value / 2;
          return (
            <XStack
              key={key}
              alignItems="center"
              gap={10}
              width="48%"
              paddingVertical={4}
            >
              <Text
                fontFamily="$mono"
                fontSize={11}
                textTransform="uppercase"
                letterSpacing={0.5}
                color={colors.textSecondary}
                width={90}
              >
                {key}
              </Text>
              <Pressable
                style={{ flex: 1, height: 20, justifyContent: 'center' }}
                onPress={(e) => {
                  const target = e.currentTarget as unknown as { offsetWidth?: number };
                  handleBarPress(key, e, target.offsetWidth ?? 0);
                }}
              >
                <View
                  style={{
                    height: 4,
                    backgroundColor: colors.borderSoft,
                    borderRadius: 99,
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${fraction * 100}%` as unknown as number,
                      backgroundColor: colors.accent,
                      borderRadius: 99,
                    }}
                  />
                </View>
              </Pressable>
              <Text
                fontFamily="$mono"
                fontSize={11}
                color={colors.textPrimary}
                width={30}
                textAlign="right"
              >
                {value.toFixed(1)}
              </Text>
            </XStack>
          );
        })}
      </View>
    </SectionCard>
  );
}
