import { Pressable, View } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { clamp, snapToStep } from './RangeSlider';

interface DualRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatLabel?: (low: number, high: number) => string;
  step?: number;
}

export function DualRangeSlider({
  min,
  max,
  value,
  onChange,
  formatLabel,
  step = 1,
}: DualRangeSliderProps) {
  const range = max - min || 1;
  const lowFrac = (value[0] - min) / range;
  const highFrac = (value[1] - min) / range;
  const label = formatLabel
    ? formatLabel(value[0], value[1])
    : `${value[0]} – ${value[1]}`;

  const handlePress = (e: { nativeEvent: { locationX: number } }, width: number) => {
    if (width <= 0) return;
    const raw = (e.nativeEvent.locationX / width) * range + min;
    const clamped = clamp(snapToStep(raw, step), min, max);

    // Move whichever handle is closer
    const distToLow = Math.abs(clamped - value[0]);
    const distToHigh = Math.abs(clamped - value[1]);

    if (distToLow <= distToHigh) {
      onChange([Math.min(clamped, value[1]), value[1]]);
    } else {
      onChange([value[0], Math.max(clamped, value[0])]);
    }
  };

  return (
    <View style={{ paddingVertical: 8, marginVertical: 4 }}>
      <Pressable
        onPress={(e) => {
          const target = e.currentTarget as unknown as { offsetWidth?: number };
          const width = target.offsetWidth ?? 0;
          handlePress(e, width);
        }}
        style={{ height: 42, justifyContent: 'center' }}
      >
        {/* Track */}
        <View
          style={{
            height: 6,
            backgroundColor: colors.borderSoft,
            borderRadius: 99,
          }}
        >
          {/* Fill between handles */}
          <View
            style={{
              position: 'absolute',
              left: `${lowFrac * 100}%` as unknown as number,
              top: 0,
              bottom: 0,
              width: `${(highFrac - lowFrac) * 100}%` as unknown as number,
              backgroundColor: colors.accent,
              borderRadius: 99,
            }}
          />
        </View>
        {/* Low handle */}
        <View
          style={{
            position: 'absolute',
            left: `${lowFrac * 100}%` as unknown as number,
            top: 14,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.background,
            transform: [{ translateX: -7 }],
          }}
        />
        {/* High handle */}
        <View
          style={{
            position: 'absolute',
            left: `${highFrac * 100}%` as unknown as number,
            top: 14,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.background,
            transform: [{ translateX: -7 }],
          }}
        />
      </Pressable>
      <XStack justifyContent="center" marginTop={4}>
        <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
          {label}
        </Text>
      </XStack>
    </View>
  );
}
