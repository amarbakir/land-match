import type { MatchDetail } from '@landmatch/api';
import { Text, View, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

const ROMAN: Record<number, string> = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII',
};

interface KeyStatsProps {
  match: MatchDetail;
}

function Stat({ label, value, isLast, color }: { label: string; value: string; isLast?: boolean; color?: string }) {
  return (
    <YStack
      flex={1}
      paddingHorizontal={18}
      paddingVertical={14}
      borderRightWidth={isLast ? 0 : 1}
      borderRightColor={colors.borderSoft}
    >
      <Text fontFamily="$mono" fontSize={10} color={colors.textFaint} textTransform="uppercase" letterSpacing={0.1 * 10}>
        {label}
      </Text>
      <Text fontSize={16} fontWeight="600" color={color ?? colors.textPrimary} fontFamily={label === 'Zoning' ? '$mono' : undefined}>
        {value}
      </Text>
    </YStack>
  );
}

export function KeyStats({ match }: KeyStatsProps) {
  const soilRoman = match.soilClass ? ROMAN[match.soilClass] : null;
  const soilSuffix = match.primeFarmland ? 'Prime' : '—';
  const soilValue = soilRoman ? `${soilRoman} ${soilSuffix}` : '—';

  const floodColor = match.floodZone === 'X' ? colors.success : match.floodZone ? colors.accent : undefined;

  const zoningDisplay = match.zoning ? match.zoning.split(' — ')[0] : '—';

  return (
    <XStack borderWidth={1} borderColor={colors.borderSoft} borderRadius={8}>
      <Stat label="Acreage" value={match.acreage != null ? `${match.acreage} ac` : '—'} />
      <Stat label="Soil Class" value={soilValue} />
      <Stat label="Flood Zone" value={match.floodZone ?? '—'} color={floodColor} />
      <Stat label="Zoning" value={zoningDisplay} isLast />
    </XStack>
  );
}
