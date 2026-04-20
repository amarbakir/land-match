import Svg, {
  Circle,
  Defs,
  G,
  Line as SvgLine,
  Path,
  Pattern,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { Text, View, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { SectionHeader } from './SectionHeader';

interface LocationSectionProps {
  lat: number | null;
  lng: number | null;
  floodZone: string | null;
}

export function LocationSection({ lat, lng, floodZone }: LocationSectionProps) {
  const showFlood = floodZone?.startsWith('AE') ?? false;
  const latStr = lat != null ? `${lat.toFixed(4)}°N` : '—';
  const lngStr = lng != null ? `${Math.abs(lng).toFixed(4)}°W` : '—';

  return (
    <YStack gap={14}>
      <SectionHeader num="04" title="Location" annotation="PARCEL OVERLAY" />
      <View
        backgroundColor={colors.cardBackground}
        borderWidth={1}
        borderColor={colors.borderSoft}
        borderRadius={8}
        overflow="hidden"
      >
        {/* Header bar */}
        <XStack
          paddingHorizontal={16}
          paddingVertical={12}
          borderBottomWidth={1}
          borderBottomColor={colors.borderSoft}
          justifyContent="space-between"
          alignItems="center"
        >
          <Text fontSize={12.5} fontWeight="600" color={colors.textPrimary}>
            Locator
          </Text>
          <Text fontFamily="$mono" fontSize={10.5} color={colors.textFaint}>
            {latStr} · {lngStr}
          </Text>
        </XStack>

        {/* SVG map */}
        <View style={{ width: '100%', height: 220, backgroundColor: '#10140F' }}>
          <Svg width="100%" height="220" viewBox="0 0 600 220" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <Pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse">
                <Path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a2118" strokeWidth={0.5} />
              </Pattern>
              <Pattern id="flood" width={8} height={8} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <SvgLine x1={0} y1={0} x2={0} y2={8} stroke={colors.success} strokeWidth={2} opacity={0.35} />
              </Pattern>
            </Defs>
            <Rect width={600} height={220} fill="url(#grid)" />
            {/* Topographic contour lines */}
            <G fill="none" stroke={colors.border} strokeWidth={0.8} opacity={0.7}>
              <Path d="M-20,80 Q120,30 280,60 T620,100" />
              <Path d="M-20,110 Q140,60 300,90 T620,130" />
              <Path d="M-20,140 Q160,90 320,120 T620,160" />
              <Path d="M-20,170 Q180,120 340,150 T620,190" />
            </G>
            {/* Road */}
            <Path d="M0,130 Q180,170 300,130 T600,140" fill="none" stroke="#3a5040" strokeWidth={2.5} strokeLinecap="round" />
            {/* Stream */}
            <Path d="M80,220 Q140,150 200,120 T360,60 T560,0" fill="none" stroke="#4a6a5c" strokeWidth={1.4} strokeDasharray="3 3" />
            {/* Flood corridor */}
            {showFlood && (
              <Path d="M80,220 Q140,150 200,120 T360,60 T560,0" fill="none" stroke="url(#flood)" strokeWidth={26} opacity={0.8} />
            )}
            {/* Parcel boundary */}
            <Polygon
              points="250,70 360,65 390,140 310,175 230,150"
              fill="rgba(212,168,67,0.08)"
              stroke={colors.accent}
              strokeWidth={1.4}
              strokeDasharray="4 3"
            />
            {/* Pin */}
            <G translate={[310, 110]}>
              <Circle r={16} fill="rgba(212,168,67,0.18)" />
              <Circle r={6} fill={colors.accent} stroke="#0F1410" strokeWidth={2} />
            </G>
            {/* Scale bar */}
            <G translate={[500, 200]}>
              <SvgLine x1={0} y1={0} x2={60} y2={0} stroke={colors.textSecondary} strokeWidth={1} />
              <SvgLine x1={0} y1={-3} x2={0} y2={3} stroke={colors.textSecondary} strokeWidth={1} />
              <SvgLine x1={60} y1={-3} x2={60} y2={3} stroke={colors.textSecondary} strokeWidth={1} />
              <SvgText x={30} y={-6} textAnchor="middle" fontSize={9} fill={colors.textSecondary} fontFamily="IBM Plex Mono">
                ¼ mi
              </SvgText>
            </G>
          </Svg>
        </View>

        {/* Legend */}
        <XStack
          position="absolute"
          bottom={8}
          left={16}
          gap={12}
        >
          <XStack alignItems="center" gap={4}>
            <View width={12} height={1} backgroundColor={colors.accent} />
            <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>Parcel</Text>
          </XStack>
          {showFlood && (
            <XStack alignItems="center" gap={4}>
              <View width={12} height={1} backgroundColor={colors.success} />
              <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>Flood AE</Text>
            </XStack>
          )}
        </XStack>
      </View>
    </YStack>
  );
}
