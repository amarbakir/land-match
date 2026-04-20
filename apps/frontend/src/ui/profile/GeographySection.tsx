import { type StyleProp, TextInput, type TextStyle, View } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { RangeSlider } from './RangeSlider';
import { SectionCard } from './SectionCard';
import { ToggleButtonRow } from './ToggleButtonRow';

interface GeographySectionProps {
  center: { lat: number; lng: number };
  radiusMiles: number;
  onChangeRadius: (radius: number) => void;
  onChangeCenter: (center: { lat: number; lng: number }) => void;
}

const GEO_TYPE_OPTIONS = [
  { value: 'radius', label: 'radius' },
  { value: 'counties', label: 'counties' },
  { value: 'driveTime', label: 'drive time' },
];

const coordInputStyle: StyleProp<TextStyle> = {
  fontFamily: 'IBM Plex Mono',
  fontSize: 12,
  color: colors.textPrimary,
  backgroundColor: colors.cardAlt,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  borderRadius: 6,
  paddingHorizontal: 10,
  paddingVertical: 6,
};

export function GeographySection({
  center,
  radiusMiles,
  onChangeRadius,
  onChangeCenter,
}: GeographySectionProps) {
  const coordHint = center.lat !== 0
    ? `RADIUS · ${center.lat.toFixed(2)}°N ${Math.abs(center.lng).toFixed(2)}°W`
    : 'RADIUS';

  return (
    <SectionCard title="Geography" hint={coordHint}>
      <RangeSlider
        min={5}
        max={200}
        value={radiusMiles}
        onChange={onChangeRadius}
        step={5}
        formatLabel={(v) => `${v}mi`}
      />
      <XStack gap={10} marginTop={12}>
        <YStack flex={1}>
          <Text fontFamily="$mono" fontSize={10} color={colors.textFaint} marginBottom={4}>
            LAT
          </Text>
          <TextInput
            value={String(center.lat)}
            onChangeText={(t) => {
              const n = parseFloat(t);
              if (!isNaN(n)) onChangeCenter({ ...center, lat: n });
            }}
            keyboardType="numeric"
            style={coordInputStyle}
          />
        </YStack>
        <YStack flex={1}>
          <Text fontFamily="$mono" fontSize={10} color={colors.textFaint} marginBottom={4}>
            LNG
          </Text>
          <TextInput
            value={String(center.lng)}
            onChangeText={(t) => {
              const n = parseFloat(t);
              if (!isNaN(n)) onChangeCenter({ ...center, lng: n });
            }}
            keyboardType="numeric"
            style={coordInputStyle}
          />
        </YStack>
      </XStack>
      <View style={{ marginTop: 16 }}>
        <ToggleButtonRow
          options={GEO_TYPE_OPTIONS}
          selected={['radius']}
          onToggle={() => {}}
          disabled
        />
      </View>
    </SectionCard>
  );
}
