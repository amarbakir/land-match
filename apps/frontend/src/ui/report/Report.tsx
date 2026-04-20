import { ActivityIndicator } from 'react-native';

import { ScrollView, Text, YStack } from 'tamagui';

import { useMatchDetail } from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';

import { EnrichmentCards } from './EnrichmentCards';
import { KeyStats } from './KeyStats';
import { LocationSection } from './LocationSection';
import { ProvenanceSection } from './ProvenanceSection';
import { ReportHero } from './ReportHero';
import { ScoreBreakdown } from './ScoreBreakdown';
import { VerdictSection } from './VerdictSection';

interface ReportProps {
  scoreId: string;
}

export function Report({ scoreId }: ReportProps) {
  const { data: match, isLoading, error } = useMatchDetail(scoreId);

  if (isLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <ActivityIndicator color={colors.accent} />
      </YStack>
    );
  }

  if (error || !match) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Text fontSize={13} color={colors.textFaint}>
          {error?.message ?? 'Failed to load property details'}
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView flex={1}>
      <YStack
        paddingHorizontal={28}
        paddingTop={40}
        paddingBottom={80}
        maxWidth={960}
        gap={32}
      >
        <ReportHero match={match} />
        <KeyStats match={match} />
        <VerdictSection match={match} />
        <ScoreBreakdown match={match} />
        <EnrichmentCards match={match} />
        <LocationSection lat={match.lat} lng={match.lng} floodZone={match.floodZone} />
        <ProvenanceSection sourcesUsed={match.sourcesUsed} />
      </YStack>
    </ScrollView>
  );
}
