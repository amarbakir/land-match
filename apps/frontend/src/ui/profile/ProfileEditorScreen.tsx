import { useState } from 'react';

import { Pressable, ScrollView, Switch, TextInput } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import {
  useCreateSearchProfile,
  useDeleteSearchProfile,
  useSearchProfiles,
  useUpdateSearchProfile,
} from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';

import { AcreageSection } from './AcreageSection';
import { AlertsSection } from './AlertsSection';
import { DeleteProfileModal } from './DeleteProfileModal';
import { FloodZoneSection } from './FloodZoneSection';
import { GeographySection } from './GeographySection';
import { InfraSection } from './InfraSection';
import { PriceSection } from './PriceSection';
import { SoilSection } from './SoilSection';
import { WeightsSection } from './WeightsSection';
import { ZoningSection } from './ZoningSection';
import {
  DEFAULT_FORM_STATE,
  type FormState,
  formStateToPayload,
  profileToFormState,
} from './formState';

interface ProfileEditorScreenProps {
  profileId?: string;
  onClose: () => void;
}

export function ProfileEditorScreen({ profileId, onClose }: ProfileEditorScreenProps) {
  const { data: profiles = [] } = useSearchProfiles();
  const existingProfile = profileId ? profiles.find((p) => p.id === profileId) : undefined;

  const [form, setForm] = useState<FormState>(() =>
    existingProfile ? profileToFormState(existingProfile) : { ...DEFAULT_FORM_STATE },
  );
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateSearchProfile();
  const updateMutation = useUpdateSearchProfile();
  const deleteMutation = useDeleteSearchProfile();

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const updateCriteria = <K extends keyof FormState['criteria']>(
    key: K,
    value: FormState['criteria'][K],
  ) => {
    setForm((prev) => ({
      ...prev,
      criteria: { ...prev.criteria, [key]: value },
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      setError('Profile name is required');
      return;
    }
    setError(null);

    const payload = formStateToPayload(form);

    if (existingProfile) {
      updateMutation.mutate(
        { id: existingProfile.id, data: payload },
        { onSuccess: onClose },
      );
    } else {
      createMutation.mutate(payload, { onSuccess: onClose });
    }
  };

  const handleDelete = () => {
    if (!existingProfile) return;
    deleteMutation.mutate(existingProfile.id, { onSuccess: onClose });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 28, paddingHorizontal: 40, paddingBottom: 80, maxWidth: 960 }}
    >
      {/* Header */}
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap={16}
        flexWrap="wrap"
        marginBottom={6}
      >
        <YStack flex={1} minWidth={320}>
          <Text
            fontFamily="$mono"
            fontSize={10}
            textTransform="uppercase"
            letterSpacing={1.4}
            color={colors.textFaint}
            marginBottom={4}
          >
            Search profile
          </Text>
          <TextInput
            value={form.name}
            onChangeText={(name) => setForm((prev) => ({ ...prev, name }))}
            placeholder="Profile name"
            placeholderTextColor={colors.textFaint}
            style={{
              fontFamily: 'Fraunces',
              fontSize: 26,
              fontWeight: '600',
              color: colors.textPrimary,
              backgroundColor: 'transparent',
              borderWidth: 0,
              paddingVertical: 2,
              letterSpacing: -0.2,
            }}
          />
        </YStack>
        <XStack alignItems="center" gap={10}>
          <XStack alignItems="center" gap={6}>
            <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>
              {form.isActive ? 'ACTIVE' : 'PAUSED'}
            </Text>
            <Switch
              value={form.isActive}
              onValueChange={(isActive) => setForm((prev) => ({ ...prev, isActive }))}
              trackColor={{ false: colors.borderSoft, true: colors.success }}
              thumbColor={colors.textPrimary}
            />
          </XStack>
          <Pressable onPress={onClose}>
            <Text
              fontSize={13}
              fontWeight="500"
              color={colors.textSecondary}
              paddingVertical={8}
              paddingHorizontal={14}
            >
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={{
              backgroundColor: 'rgba(212,168,67,0.15)',
              borderWidth: 1,
              borderColor: 'rgba(212,168,67,0.3)',
              borderRadius: 6,
              paddingVertical: 8,
              paddingHorizontal: 16,
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            <Text fontSize={13} fontWeight="600" color={colors.accent}>
              {isSaving ? 'Saving...' : 'Save profile'}
            </Text>
          </Pressable>
        </XStack>
      </XStack>

      {error && (
        <Text fontSize={12} color={colors.danger} marginBottom={8}>
          {error}
        </Text>
      )}

      <Text fontSize={13} color={colors.textSecondary} marginBottom={22}>
        Tune what lands in your inbox. Changes apply to future listings — past scores
        aren't retroactively recalculated.
      </Text>

      {/* Sections */}
      <GeographySection
        type={form.criteria.geography.type}
        center={form.criteria.geography.center}
        radiusMiles={form.criteria.geography.radiusMiles}
        onChangeRadius={(radiusMiles) =>
          updateCriteria('geography', { ...form.criteria.geography, radiusMiles })
        }
        onChangeCenter={(center) =>
          updateCriteria('geography', { ...form.criteria.geography, center })
        }
      />
      <AcreageSection
        min={form.criteria.acreage.min}
        max={form.criteria.acreage.max}
        onChange={([min, max]) => updateCriteria('acreage', { min, max })}
      />
      <PriceSection
        max={form.criteria.price.max}
        onChange={(max) => updateCriteria('price', { max })}
      />
      <SoilSection
        maxClass={form.criteria.soilCapabilityClass.max}
        onChange={(max) => updateCriteria('soilCapabilityClass', { max })}
      />
      <FloodZoneSection
        excluded={form.criteria.floodZoneExclude}
        onChange={(excluded) => updateCriteria('floodZoneExclude', excluded)}
      />
      <ZoningSection
        selected={form.criteria.zoning}
        onChange={(zoning) => updateCriteria('zoning', zoning)}
      />
      <InfraSection
        selected={form.criteria.infrastructure}
        onChange={(infrastructure) => updateCriteria('infrastructure', infrastructure)}
      />
      <WeightsSection
        weights={form.criteria.weights}
        onChange={(weights) => updateCriteria('weights', weights)}
      />
      <AlertsSection
        threshold={form.alertThreshold}
        frequency={form.alertFrequency}
        onChangeThreshold={(alertThreshold) =>
          setForm((prev) => ({ ...prev, alertThreshold }))
        }
        onChangeFrequency={(alertFrequency) =>
          setForm((prev) => ({ ...prev, alertFrequency }))
        }
      />

      {/* Delete */}
      {existingProfile && (
        <Pressable
          onPress={() => setShowDelete(true)}
          style={{ marginTop: 24, alignSelf: 'flex-start' }}
        >
          <Text
            fontSize={12}
            fontFamily="$mono"
            color={colors.danger}
            textDecorationLine="underline"
          >
            Delete this profile
          </Text>
        </Pressable>
      )}

      <DeleteProfileModal
        profileName={form.name}
        visible={showDelete}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </ScrollView>
  );
}
