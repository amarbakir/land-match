import type { ReactElement } from 'react';

import type { MatchDetail } from '@landmatch/api';
import { Text, View, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';
import { DropletIcon, HomeIcon, SeedIcon, SunIcon } from '@/src/ui/dashboard/Icon';

import { ROMAN } from './constants';
import { SectionHeader } from './SectionHeader';

const SOIL_LABELS: Record<number, string> = {
  1: 'Excellent — few limitations',
  2: 'Good — moderate limitations',
  3: 'Fair — severe limitations',
  4: 'Poor — very severe limitations',
  5: 'Unsuited for cultivation',
  6: 'Marginal for grazing/forestry',
  7: 'Severe limitations',
  8: 'Unsuitable for agriculture',
};

interface DataRow {
  key: string;
  value: string | null;
}

function tierBadgeStyle(score: number): { color: string; bg: string } {
  if (score >= 80) return { color: colors.success, bg: `${colors.success}1F` };
  if (score >= 60) return { color: colors.accentSecondary, bg: `${colors.accentSecondary}1F` };
  return { color: colors.danger, bg: `${colors.danger}1F` };
}

function DataCard({
  icon,
  title,
  score,
  rows,
}: {
  icon: ReactElement;
  title: string;
  score?: number | null;
  rows: DataRow[];
}) {
  const badge = score != null ? tierBadgeStyle(score) : null;

  return (
    <View
      backgroundColor={colors.cardBackground}
      borderWidth={1}
      borderColor={colors.borderSoft}
      borderRadius={8}
      paddingHorizontal={18}
      paddingVertical={16}
    >
      {/* Card header */}
      <XStack alignItems="center" gap={8} marginBottom={12}>
        <View
          width={24}
          height={24}
          borderRadius={5}
          backgroundColor={`${colors.accent}1A`}
          alignItems="center"
          justifyContent="center"
        >
          {icon}
        </View>
        <Text fontSize={12.5} fontWeight="600" color={colors.textPrimary}>
          {title}
        </Text>
        {badge && score != null && (
          <View
            marginLeft="auto"
            paddingHorizontal={6}
            paddingVertical={2}
            borderRadius={3}
            backgroundColor={badge.bg}
          >
            <Text fontFamily="$mono" fontSize={10} color={badge.color}>
              {score}
            </Text>
          </View>
        )}
      </XStack>

      {/* Rows */}
      <YStack gap={6}>
        {rows.map((row, i) => (
          <XStack
            key={row.key}
            justifyContent="space-between"
            alignItems="center"
            paddingVertical={4}
            {...(i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSoft, borderStyle: 'dashed' as const } : {})}
          >
            <Text fontSize={12} color={colors.textFaint}>
              {row.key}
            </Text>
            {row.value != null ? (
              <Text fontFamily="$mono" fontSize={11.5} fontWeight="500" color={colors.textPrimary}>
                {row.value}
              </Text>
            ) : (
              <Text fontSize={11.5} color={colors.textFaint} fontStyle="italic">
                N/A
              </Text>
            )}
          </XStack>
        ))}
      </YStack>
    </View>
  );
}

function formatRisk(score: number | null): string | null {
  return score != null ? `${score}/10` : null;
}

interface EnrichmentCardsProps {
  match: MatchDetail;
}

export function EnrichmentCards({ match }: EnrichmentCardsProps) {
  const sourcesCount = match.sourcesUsed?.length ?? 0;

  const soilClassDisplay = match.soilClass
    ? `${ROMAN[match.soilClass] ?? match.soilClass} — ${SOIL_LABELS[match.soilClass] ?? 'Unknown'}`
    : null;

  const zoningDisplay = match.zoning
    ? match.zoning + (match.zoningDescription ? ` — ${match.zoningDescription}` : '')
    : null;

  return (
    <YStack gap={14}>
      <SectionHeader num="03" title="Enrichment data" annotation={`${sourcesCount} SOURCES`} />
      <XStack gap={12} flexWrap="wrap">
        <View flex={1} minWidth={300}>
          <DataCard
            icon={<SeedIcon size={14} color={colors.accent} />}
            title="Soil · USDA"
            score={match.componentScores.soil}
            rows={[
              { key: 'Capability class', value: soilClassDisplay },
              { key: 'Drainage', value: match.soilDrainageClass },
              { key: 'Texture', value: match.soilTexture },
              { key: 'Prime farmland', value: match.primeFarmland != null ? (match.primeFarmland ? 'Yes' : 'No') : null },
            ]}
          />
        </View>
        <View flex={1} minWidth={300}>
          <DataCard
            icon={<DropletIcon size={14} color={colors.accent} />}
            title="Flood · FEMA"
            score={match.componentScores.flood}
            rows={[
              { key: 'Zone', value: match.floodZone },
              { key: 'Description', value: match.floodZoneDescription },
            ]}
          />
        </View>
        <View flex={1} minWidth={300}>
          <DataCard
            icon={<HomeIcon size={14} color={colors.accent} />}
            title="Parcel · Regrid"
            score={match.componentScores.zoning}
            rows={[
              { key: 'Zoning', value: zoningDisplay },
              { key: 'Verified acreage', value: match.verifiedAcreage != null ? `${match.verifiedAcreage} ac` : null },
            ]}
          />
        </View>
        <View flex={1} minWidth={300}>
          <DataCard
            icon={<SunIcon size={14} color={colors.accent} />}
            title="Climate · First Street"
            score={match.componentScores.climate}
            rows={[
              { key: 'Fire risk', value: formatRisk(match.fireRiskScore) },
              { key: 'Flood risk', value: formatRisk(match.floodRiskScore) },
              { key: 'Heat risk', value: formatRisk(match.heatRiskScore) },
              { key: 'Drought risk', value: formatRisk(match.droughtRiskScore) },
            ]}
          />
        </View>
      </XStack>
    </YStack>
  );
}
