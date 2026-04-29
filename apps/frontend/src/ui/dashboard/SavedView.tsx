import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { SavedListingItem } from '@landmatch/api';
import { Spinner, Text, XStack, YStack } from 'tamagui';

import { useSavedListings, useUnsaveListing } from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';

import { EmptyState } from './EmptyState';
import { BookmarkIcon } from './Icon';
import { ScoreRing } from './ScoreRing';
import { Tag } from './Tag';
import type { TagTone } from './Tag';
import { SOIL_CLASS_LABELS, FLOOD_ZONE_LABELS } from '../landLabels';
import { formatPrice, formatTime } from './MatchRow';

function deriveSavedTags(item: SavedListingItem): { label: string; tone: TagTone }[] {
  const tags: { label: string; tone: TagTone }[] = [];
  if (item.floodZone === 'X') tags.push({ label: 'Zone X', tone: 'green' });
  else if (item.floodZone) tags.push({ label: `Zone ${item.floodZone}`, tone: item.floodZone === 'A' || item.floodZone === 'AE' ? 'clay' : 'default' });
  if (item.soilClass != null && item.soilClass <= 2) tags.push({ label: 'Prime Soil', tone: 'gold' });
  else if (item.soilClass != null) tags.push({ label: `Class ${item.soilClass}`, tone: 'default' });
  if (item.zoning) tags.push({ label: item.zoning, tone: 'default' });
  return tags.slice(0, 3);
}

function SavedRow({
  item,
  selected,
  onPress,
}: {
  item: SavedListingItem;
  selected: boolean;
  onPress: () => void;
}) {
  const tags = deriveSavedTags(item);

  return (
    <Pressable onPress={onPress}>
      <XStack
        backgroundColor={selected ? colors.cardBackground : 'transparent'}
        borderLeftWidth={selected ? 3 : 0}
        borderLeftColor={selected ? colors.accent : 'transparent'}
        paddingLeft={selected ? 13 : 16}
        paddingRight={16}
        paddingVertical={10}
        borderBottomWidth={1}
        borderBottomColor={colors.borderSoft}
        gap={10}
        alignItems="flex-start"
      >
        {item.homesteadScore != null ? (
          <ScoreRing score={item.homesteadScore} size={40} />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 2,
              borderColor: colors.border,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text fontSize={9} color={colors.textFaint}>—</Text>
          </View>
        )}

        <YStack flex={1} gap={2}>
          <Text
            fontSize={12.5}
            fontWeight="500"
            color={colors.textPrimary}
            numberOfLines={1}
          >
            {item.title ?? item.address}
          </Text>

          <XStack gap={4}>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {formatPrice(item.price)}
            </Text>
            <Text fontSize={10.5} color={colors.textFaint}>·</Text>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {item.acreage ?? '—'}ac
            </Text>
            <Text fontSize={10.5} color={colors.textFaint}>·</Text>
            <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
              {item.source ?? '—'}
            </Text>
          </XStack>

          {item.bestScore && (
            <Text fontSize={10} color={colors.textSecondary}>
              {item.bestScore.score} in {item.bestScore.profileName}
            </Text>
          )}

          {tags.length > 0 && (
            <XStack gap={4} marginTop={3} flexWrap="wrap">
              {tags.map((t) => (
                <Tag key={t.label} label={t.label} tone={t.tone} />
              ))}
            </XStack>
          )}
        </YStack>

        <Text fontFamily="$mono" fontSize={9.5} color={colors.textFaint}>
          {formatTime(item.savedAt)}
        </Text>
      </XStack>
    </Pressable>
  );
}

function DataRow({ label, value }: { label: string; value: string | null }) {
  return (
    <XStack justifyContent="space-between" alignItems="center" paddingVertical={4}>
      <Text fontSize={13} color={colors.textSecondary}>
        {label}
      </Text>
      {value ? (
        <Text fontSize={13} color={colors.textPrimary} fontFamily="$mono">
          {value}
        </Text>
      ) : (
        <Text fontSize={13} color={colors.textFaint}>—</Text>
      )}
    </XStack>
  );
}

function SavedDetail({ item, onUnsave }: { item: SavedListingItem; onUnsave: () => void }) {
  return (
    <ScrollView style={{ flex: 1 }}>
      <YStack paddingHorizontal={28} paddingTop={32} paddingBottom={80} maxWidth={720} gap={24}>
        {/* Header */}
        <YStack gap={6}>
          <Text fontSize={20} fontWeight="700" color={colors.textPrimary}>
            {item.title ?? item.address}
          </Text>
          <Text fontSize={13} color={colors.textSecondary}>{item.address}</Text>
          <XStack gap={12} marginTop={4}>
            <Text fontFamily="$mono" fontSize={14} color={colors.textPrimary}>
              {formatPrice(item.price)}
            </Text>
            {item.acreage != null && (
              <Text fontFamily="$mono" fontSize={14} color={colors.textPrimary}>
                {item.acreage} acres
              </Text>
            )}
          </XStack>
        </YStack>

        {/* Homestead score */}
        {item.homesteadScore != null && (
          <YStack
            backgroundColor={colors.cardBackground}
            borderRadius={12}
            padding={16}
            borderWidth={1}
            borderColor={colors.border}
            gap={8}
          >
            <Text fontSize={11} fontFamily="$mono" textTransform="uppercase" letterSpacing={0.8} color={colors.textFaint}>
              Homestead Score
            </Text>
            <XStack alignItems="center" gap={12}>
              <ScoreRing score={item.homesteadScore} size={48} />
              <Text fontSize={14} color={colors.textPrimary}>
                {item.homesteadScore >= 70 ? 'Good potential' :
                 item.homesteadScore >= 50 ? 'Moderate potential' : 'Limited potential'}
              </Text>
            </XStack>
          </YStack>
        )}

        {/* Best profile score */}
        {item.bestScore && (
          <YStack
            backgroundColor={colors.cardBackground}
            borderRadius={12}
            padding={16}
            borderWidth={1}
            borderColor={colors.border}
            gap={4}
          >
            <Text fontSize={11} fontFamily="$mono" textTransform="uppercase" letterSpacing={0.8} color={colors.textFaint}>
              Best Match Score
            </Text>
            <XStack alignItems="center" gap={8}>
              <ScoreRing score={item.bestScore.score} size={36} />
              <Text fontSize={13} color={colors.textPrimary}>
                {item.bestScore.score}/100 in <Text fontWeight="600">{item.bestScore.profileName}</Text>
              </Text>
            </XStack>
          </YStack>
        )}

        {/* Enrichment data */}
        <YStack
          backgroundColor={colors.cardBackground}
          borderRadius={12}
          padding={16}
          borderWidth={1}
          borderColor={colors.border}
          gap={4}
        >
          <Text fontSize={11} fontFamily="$mono" textTransform="uppercase" letterSpacing={0.8} color={colors.textFaint} marginBottom={8}>
            Land Data
          </Text>
          <DataRow
            label="Soil Class"
            value={item.soilClass != null ? `Class ${item.soilClass} — ${SOIL_CLASS_LABELS[item.soilClass] ?? ''}` : null}
          />
          <DataRow
            label="Flood Zone"
            value={item.floodZone ? `Zone ${item.floodZone} — ${FLOOD_ZONE_LABELS[item.floodZone] ?? ''}` : null}
          />
          <DataRow
            label="Zoning"
            value={item.zoning}
          />
        </YStack>

        {/* Actions */}
        <XStack gap={12}>
          {item.url && (
            <Pressable
              onPress={() => {
                if (typeof window !== 'undefined') window.open(item.url!, '_blank');
              }}
            >
              <XStack
                backgroundColor={colors.cardBackground}
                borderRadius={8}
                paddingHorizontal={14}
                paddingVertical={8}
                borderWidth={1}
                borderColor={colors.border}
                gap={6}
                alignItems="center"
              >
                <Text fontSize={12} color={colors.textPrimary}>View Listing</Text>
              </XStack>
            </Pressable>
          )}
          <Pressable onPress={onUnsave}>
            <XStack
              backgroundColor={colors.cardBackground}
              borderRadius={8}
              paddingHorizontal={14}
              paddingVertical={8}
              borderWidth={1}
              borderColor={colors.border}
              gap={6}
              alignItems="center"
            >
              <BookmarkIcon size={12} color={colors.danger} />
              <Text fontSize={12} color={colors.danger}>Unsave</Text>
            </XStack>
          </Pressable>
        </XStack>
      </YStack>
    </ScrollView>
  );
}

export function SavedView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useSavedListings();
  const unsave = useUnsaveListing();

  const items = data?.items ?? [];
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const handleUnsave = (listingId: string) => {
    unsave.mutate(listingId);
    if (selectedId && selectedItem?.listingId === listingId) {
      setSelectedId(null);
    }
  };

  return (
    <>
      {/* List pane */}
      <YStack
        width={400}
        minWidth={400}
        borderRightWidth={1}
        borderRightColor={colors.border}
        backgroundColor={colors.background}
      >
        <XStack
          paddingHorizontal={16}
          paddingVertical={12}
          borderBottomWidth={1}
          borderBottomColor={colors.borderSoft}
          justifyContent="space-between"
          alignItems="center"
        >
          <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
            Saved Listings
          </Text>
          <Text fontFamily="$mono" fontSize={11} color={colors.textSecondary}>
            {data?.total ?? 0}
          </Text>
        </XStack>

        {isLoading ? (
          <YStack flex={1} justifyContent="center" alignItems="center">
            <Spinner size="small" color={colors.accent} />
          </YStack>
        ) : items.length === 0 ? (
          <EmptyState
            title="No saved listings"
            subtitle="Save listings from the browser extension to see them here."
          />
        ) : (
          <ScrollView style={{ flex: 1 }}>
            {items.map((item) => (
              <SavedRow
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                onPress={() => setSelectedId(item.id)}
              />
            ))}
          </ScrollView>
        )}
      </YStack>

      {/* Detail pane */}
      {selectedItem ? (
        <SavedDetail item={selectedItem} onUnsave={() => handleUnsave(selectedItem.listingId)} />
      ) : (
        <EmptyState
          title="Select a listing"
          subtitle="Choose a saved listing to view its details."
        />
      )}
    </>
  );
}
