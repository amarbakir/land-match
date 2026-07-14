import { ActivityIndicator } from 'react-native';

import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { useMatchDetail } from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';
import { Tag } from '@/src/ui/dashboard/Tag';

import { EnrichmentCards } from './EnrichmentCards';
import { KeyStats } from './KeyStats';
import { LocationSection } from './LocationSection';
import { ProvenanceSection } from './ProvenanceSection';
import { ReportHero } from './ReportHero';
import { ScoreBreakdown } from './ScoreBreakdown';
import { VerdictSection } from './VerdictSection';

interface ReportProps {
  scoreId: string;
  floodUnverified?: boolean;
}

export function Report({ scoreId, floodUnverified = false }: ReportProps) {
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
        {floodUnverified && match.floodZone == null && (
          <XStack>
            <Tag label="Flood zone unverified" tone="clay" />
          </XStack>
        )}
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
