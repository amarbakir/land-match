import { useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';

import { Input, InputProps, Text, XStack, YStack } from 'tamagui';

import { useEnrichListing } from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';
import { SOIL_CLASS_LABELS, FLOOD_ZONE_LABELS } from '@/src/ui/landLabels';
import { Badge } from '@/src/ui/primitives/Badge';
import { Button } from '@/src/ui/primitives/Button';
import { Card } from '@/src/ui/primitives/Card';
import { Screen } from '@/src/ui/primitives/Screen';

const inputStyles = {
  backgroundColor: colors.background,
  borderColor: colors.border,
  color: colors.textPrimary,
  placeholderTextColor: colors.textSecondary,
} satisfies InputProps;


function toRomanNumeral(n: number): string {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  return numerals[n - 1] ?? String(n);
}

function NotAvailable() {
  return (
    <Text fontSize={13} color={colors.textSecondary}>
      Not available
    </Text>
  );
}

function DataRow({ label, value }: { label: string; value: string | null }) {
  return (
    <XStack justifyContent="space-between" alignItems="center" paddingVertical="$1">
      <Text fontSize={13} color={colors.textSecondary}>
        {label}
      </Text>
      {value ? (
        <Text fontSize={13} color={colors.textPrimary} fontWeight="500">
          {value}
        </Text>
      ) : (
        <NotAvailable />
      )}
    </XStack>
  );
}

export default function ReportScreen() {
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [acreage, setAcreage] = useState('');
  const mutation = useEnrichListing();

  function handleAnalyze() {
    if (!address.trim()) return;
    mutation.mutate({
      address: address.trim(),
      ...(price ? { price: Number(price) } : {}),
      ...(acreage ? { acreage: Number(acreage) } : {}),
    });
  }

  const data = mutation.data;
  const enrichment = data?.enrichment;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Form */}
        <Card>
          <Text fontSize={13} color={colors.textSecondary} marginBottom="$2">
            Enter a property address to analyze
          </Text>
          <Input
            placeholder="123 Mountain Rd, Gatlinburg, TN 37738"
            value={address}
            onChangeText={setAddress}
            {...inputStyles}
            marginBottom="$3"
          />
          <XStack gap="$2" marginBottom="$3">
            <Input
              flex={1}
              placeholder="Price ($)"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              {...inputStyles}
            />
            <Input
              flex={1}
              placeholder="Acreage"
              value={acreage}
              onChangeText={setAcreage}
              keyboardType="numeric"
              {...inputStyles}
            />
          </XStack>
          <Button
            buttonVariant="primary"
            onPress={handleAnalyze}
            disabled={!address.trim() || mutation.isPending}
            opacity={!address.trim() || mutation.isPending ? 0.5 : 1}
          >
            {mutation.isPending ? 'Analyzing...' : 'Analyze Property'}
          </Button>
        </Card>

        {/* Loading */}
        {mutation.isPending && (
          <YStack alignItems="center" padding="$4">
            <ActivityIndicator color={colors.accent} size="large" />
            <Text fontSize={13} color={colors.textSecondary} marginTop="$2">
              Enriching property data...
            </Text>
          </YStack>
        )}

        {/* Error */}
        {mutation.isError && (
          <Card borderColor={colors.danger}>
            <Text fontSize={14} color={colors.danger} fontWeight="600" marginBottom="$2">
              Analysis Failed
            </Text>
            <Text fontSize={13} color={colors.textSecondary} marginBottom="$3">
              {mutation.error.message}
            </Text>
            <Button buttonVariant="outline" onPress={handleAnalyze}>
              Try Again
            </Button>
          </Card>
        )}

        {/* Success */}
        {data && (
          <>
            {/* Property Card */}
            <Card>
              <Text fontSize={15} fontWeight="700" color={colors.accent} marginBottom="$2">
                Property
              </Text>
              <DataRow label="Address" value={data.listing.address} />
              <DataRow
                label="Coordinates"
                value={`${data.listing.latitude.toFixed(4)}, ${data.listing.longitude.toFixed(4)}`}
              />
              {data.listing.price !== null && (
                <DataRow
                  label="Price"
                  value={`$${data.listing.price.toLocaleString()}`}
                />
              )}
              {data.listing.acreage !== null && (
                <DataRow
                  label="Acreage"
                  value={`${data.listing.acreage} acres`}
                />
              )}
            </Card>

            {/* Soil Quality Card */}
            <Card>
              <Text fontSize={15} fontWeight="700" color={colors.accent} marginBottom="$2">
                Soil Quality
              </Text>
              <DataRow
                label="Capability Class"
                value={
                  enrichment?.soilCapabilityClass != null
                    ? `${toRomanNumeral(enrichment.soilCapabilityClass)} — ${SOIL_CLASS_LABELS[enrichment.soilCapabilityClass] ?? 'Unknown'}`
                    : null
                }
              />
              <DataRow label="Drainage" value={enrichment?.soilDrainageClass ?? null} />
              <DataRow label="Texture" value={enrichment?.soilTexture ?? null} />
            </Card>

            {/* Flood Risk Card */}
            <Card>
              <Text fontSize={15} fontWeight="700" color={colors.accent} marginBottom="$2">
                Flood Risk
              </Text>
              <DataRow
                label="FEMA Zone"
                value={
                  enrichment?.femaFloodZone
                    ? `${enrichment.femaFloodZone} — ${FLOOD_ZONE_LABELS[enrichment.femaFloodZone] ?? 'Unknown zone'}`
                    : null
                }
              />
            </Card>

            {/* Data Sources Card */}
            <Card>
              <Text fontSize={15} fontWeight="700" color={colors.accent} marginBottom="$2">
                Data Sources
              </Text>
              {enrichment && enrichment.sourcesUsed.length > 0 && (
                <XStack gap="$2" flexWrap="wrap" marginBottom="$2">
                  {enrichment.sourcesUsed.map((source) => (
                    <Badge key={source} text={source} />
                  ))}
                </XStack>
              )}
              {enrichment && enrichment.errors.length > 0 && (
                <YStack gap="$1" marginTop="$1">
                  {enrichment.errors.map((err) => (
                    <Text
                      key={`${err.source}-${err.error}`}
                      fontSize={12}
                      color={colors.danger}
                    >
                      {err.source}: {err.error}
                    </Text>
                  ))}
                </YStack>
              )}
              {enrichment &&
                enrichment.sourcesUsed.length === 0 &&
                enrichment.errors.length === 0 && (
                  <NotAvailable />
                )}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
