import { ScrollView } from 'react-native';

import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';
import { Badge } from '@/src/ui/primitives/Badge';
import { Button } from '@/src/ui/primitives/Button';
import { Card } from '@/src/ui/primitives/Card';
import { Screen } from '@/src/ui/primitives/Screen';

const MOCK_LISTINGS = [
  {
    id: '1',
    title: '40 Acres — Benton County, AR',
    description: 'Mixed hardwood, year-round creek, county road access. Class II soils on 60% of parcel.',
    matchScore: 87,
    scores: { soil: 92, flood: 95, climate: 74, zoning: 88 },
    badges: ['Low Flood Risk', 'Prime Farmland', 'Well Permit OK'],
  },
  {
    id: '2',
    title: '15 Acres — Ozark County, MO',
    description: 'South-facing slope, spring-fed pond, gravel road. Timber and pasture mix.',
    matchScore: 72,
    scores: { soil: 68, flood: 85, climate: 70, zoning: 65 },
    badges: ['Spring Water', 'Timber Value'],
  },
  {
    id: '3',
    title: '80 Acres — Carroll County, AR',
    description: 'Rolling pasture with barn, fenced perimeter, paved road frontage. Municipal water available.',
    matchScore: 91,
    scores: { soil: 88, flood: 98, climate: 82, zoning: 95 },
    badges: ['Low Flood Risk', 'Prime Farmland', 'Paved Access', 'Municipal Water'],
  },
];

function scoreColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.accentSecondary;
  return colors.danger;
}

function ScoreCell({ label, score }: { label: string; score: number }) {
  return (
    <YStack flex={1} alignItems="center" backgroundColor={colors.background} borderRadius="$2" padding="$2">
      <Text fontSize={11} color={colors.textSecondary}>{label}</Text>
      <Text fontSize={16} fontWeight="600" color={scoreColor(score)}>{score}</Text>
    </YStack>
  );
}

function ListingCard({ listing }: { listing: (typeof MOCK_LISTINGS)[number] }) {
  return (
    <Card>
      <XStack justifyContent="space-between" alignItems="flex-start">
        <YStack flex={1} marginRight="$3">
          <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>{listing.title}</Text>
          <Text fontSize={12} color={colors.textSecondary} marginTop="$1" lineHeight={18}>
            {listing.description}
          </Text>
        </YStack>
        <YStack alignItems="center">
          <Text fontSize={28} fontWeight="700" color={scoreColor(listing.matchScore)}>
            {listing.matchScore}
          </Text>
          <Text fontSize={10} color={colors.textSecondary}>Match Score</Text>
        </YStack>
      </XStack>

      <XStack gap="$2" marginTop="$3">
        <ScoreCell label="Soil" score={listing.scores.soil} />
        <ScoreCell label="Flood" score={listing.scores.flood} />
        <ScoreCell label="Climate" score={listing.scores.climate} />
        <ScoreCell label="Zoning" score={listing.scores.zoning} />
      </XStack>

      <XStack gap="$2" marginTop="$2" flexWrap="wrap">
        {listing.badges.map((badge) => (
          <Badge key={badge} text={badge} />
        ))}
      </XStack>
    </Card>
  );
}

export default function SearchScreen() {
  const router = useRouter();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Search bar */}
        <XStack
          backgroundColor={colors.cardBackground}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          padding="$3"
          alignItems="center"
          gap="$2"
        >
          <Text flex={1} color={colors.textSecondary} fontSize={14}>
            Search by county, state, or coordinates...
          </Text>
          <Button
            buttonVariant="primary"
            size="$3"
            paddingHorizontal="$3"
            onPress={() => router.push('/(app)/report')}
          >
            Search
          </Button>
        </XStack>

        {/* Section label */}
        <Text
          fontSize={11}
          color={colors.textSecondary}
          textTransform="uppercase"
          letterSpacing={1}
        >
          Top Matches
        </Text>

        {/* Listing cards */}
        {MOCK_LISTINGS.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </ScrollView>
    </Screen>
  );
}
