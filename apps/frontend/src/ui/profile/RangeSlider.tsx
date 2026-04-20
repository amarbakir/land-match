import { Pressable, View } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface RangeSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  formatLabel?: (value: number) => string;
  step?: number;
}

export function RangeSlider({
  min,
  max,
  value,
  onChange,
  formatLabel,
  step = 1,
}: RangeSliderProps) {
  const fraction = max > min ? (value - min) / (max - min) : 0;
  const label = formatLabel ? formatLabel(value) : String(value);

  const handlePress = (e: { nativeEvent: { locationX: number } }, width: number) => {
    if (width <= 0) return;
    const raw = (e.nativeEvent.locationX / width) * (max - min) + min;
    onChange(clamp(snapToStep(raw, step), min, max));
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
          {/* Fill */}
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
        {/* Handle */}
        <View
          style={{
            position: 'absolute',
            left: `${fraction * 100}%` as unknown as number,
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
      {/* Label */}
      <XStack justifyContent="center" marginTop={4}>
        <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
          {label}
        </Text>
      </XStack>
    </View>
  );
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Snap a value to the nearest step */
export function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}
