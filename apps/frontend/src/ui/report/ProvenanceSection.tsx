import { Text, View, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';
import { CheckIcon } from '@/src/ui/dashboard/Icon';

import { SectionHeader } from './SectionHeader';

const KNOWN_SOURCES = ['USDA Soil', 'FEMA NFHL', 'Regrid', 'First Street'];

interface ProvenanceSectionProps {
  sourcesUsed: string[] | null;
}

export function ProvenanceSection({ sourcesUsed }: ProvenanceSectionProps) {
  if (sourcesUsed == null) {
    return (
      <YStack gap={14}>
        <SectionHeader num="05" title="Data provenance" />
        <Text fontFamily="$mono" fontSize={12} color={colors.textFaint}>
          No provenance data
        </Text>
      </YStack>
    );
  }

  const usedSet = new Set(sourcesUsed);

  return (
    <YStack gap={14}>
      <SectionHeader num="05" title="Data provenance" />
      <XStack gap={6} flexWrap="wrap">
        {KNOWN_SOURCES.map((source) => {
          const isUsed = usedSet.has(source);
          const chipColor = isUsed ? colors.accent : colors.danger;

          return (
            <XStack
              key={source}
              alignItems="center"
              gap={4}
              paddingHorizontal={11}
              paddingVertical={5}
              borderRadius={999}
              borderWidth={1}
              borderColor={`${chipColor}4D`}
              backgroundColor={`${chipColor}1A`}
            >
              {isUsed && <CheckIcon size={12} color={chipColor} />}
              <Text fontFamily="$mono" fontSize={12} color={chipColor} letterSpacing={0.02 * 12}>
                {source}
              </Text>
            </XStack>
          );
        })}
      </XStack>
    </YStack>
  );
}
