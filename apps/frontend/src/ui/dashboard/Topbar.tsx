import { Pressable, View } from 'react-native';

import type { SearchProfileResponse } from '@landmatch/api';
import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { BellIcon, SearchIcon } from './Icon';
import type { WorkspaceView } from './types';

interface TopbarProps {
  view: WorkspaceView;
  profile: SearchProfileResponse | null;
  hasNotifications?: boolean;
}

const VIEW_LABELS: Record<WorkspaceView, string> = {
  inbox: 'Matches',
  shortlist: 'Shortlist',
  dismissed: 'Dismissed',
};

function formatCoord(profile: SearchProfileResponse | null): string | null {
  const center = profile?.criteria?.geography?.center;
  if (!center) return null;
  const radius = profile?.criteria?.geography?.radiusMiles ?? 60;
  return `${center.lat.toFixed(2)}°N · ${Math.abs(center.lng).toFixed(2)}°W · ${radius}mi`;
}

export function Topbar({ view, profile, hasNotifications }: TopbarProps) {
  const coord = formatCoord(profile);

  return (
    <XStack
      paddingHorizontal={20}
      paddingVertical={10}
      borderBottomWidth={1}
      borderBottomColor={colors.border}
      backgroundColor={colors.background}
      justifyContent="space-between"
      alignItems="center"
    >
      {/* Breadcrumbs */}
      <XStack alignItems="center" gap={6}>
        <Text fontSize={12} color={colors.textSecondary}>Workspace</Text>
        <Text fontSize={12} color={colors.textFaint}>›</Text>
        <Text fontSize={12} fontWeight="600" color={colors.textPrimary}>
          {VIEW_LABELS[view]}
        </Text>
      </XStack>

      {/* Actions */}
      <XStack alignItems="center" gap={6}>
        {coord && (
          <XStack
            backgroundColor={colors.cardBackground}
            borderWidth={1}
            borderColor={colors.border}
            paddingHorizontal={10}
            paddingVertical={3}
            borderRadius={12}
            marginRight={4}
          >
            <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>
              {coord}
            </Text>
          </XStack>
        )}
        <Pressable style={{ width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center' }}>
          <SearchIcon size={14} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={{ width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <BellIcon size={14} color={colors.textSecondary} />
          {hasNotifications && (
            <View
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.accent,
              }}
            />
          )}
        </Pressable>
      </XStack>
    </XStack>
  );
}
