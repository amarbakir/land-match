import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { ProfileCounts, SearchProfileResponse } from '@landmatch/api';
import { Text, XStack, YStack } from 'tamagui';

import { useAuth } from '@/src/auth/useAuth';
import { colors } from '@/src/theme/colors';

import {
  ArchiveIcon,
  BellIcon,
  BookmarkIcon,
  EditIcon,
  InboxIcon,
  PlusIcon,
  SettingsIcon,
  StarIcon,
} from './Icon';
import type { WorkspaceView } from './types';

interface SidebarNavProps {
  activeView: WorkspaceView;
  profiles: SearchProfileResponse[];
  profileCounts: ProfileCounts;
  savedCount?: number;
  onSelectView: (view: WorkspaceView) => void;
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onNewProfile: () => void;
}

function NavItem({
  label,
  icon,
  count,
  active,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  count?: number;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <XStack
        backgroundColor={active ? colors.cardAlt : 'transparent'}
        borderLeftWidth={active ? 2 : 0}
        borderLeftColor={active ? colors.accent : 'transparent'}
        paddingVertical={7}
        paddingHorizontal={16}
        marginHorizontal={8}
        marginVertical={1}
        borderRadius={6}
        alignItems="center"
        gap={8}
      >
        <View style={{ opacity: active ? 1 : 0.7 }}>{icon}</View>
        <Text flex={1} fontSize={12.5} color={active ? colors.textPrimary : colors.textSecondary}>
          {label}
        </Text>
        {count !== undefined && count > 0 && (
          <Text
            fontFamily="$mono"
            fontSize={10}
            color={active ? colors.accent : colors.textFaint}
            backgroundColor={active ? 'rgba(212,168,67,0.12)' : 'transparent'}
            paddingHorizontal={active ? 6 : 0}
            paddingVertical={active ? 1 : 0}
            borderRadius={8}
          >
            {count}
          </Text>
        )}
      </XStack>
    </Pressable>
  );
}

function ProfileItem({
  profile,
  newCount,
  onSelect,
  onEdit,
}: {
  profile: SearchProfileResponse;
  newCount: number;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onSelect}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <XStack
        paddingVertical={7}
        paddingHorizontal={16}
        marginHorizontal={8}
        marginVertical={1}
        borderRadius={6}
        alignItems="center"
        gap={8}
        backgroundColor={hovered ? colors.hoverSubtle : 'transparent'}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: profile.isActive ? colors.success : colors.textFaint,
          }}
        />
        <Text
          flex={1}
          fontSize={12.5}
          color={colors.textSecondary}
          numberOfLines={1}
        >
          {profile.name}
        </Text>
        {hovered ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            hitSlop={8}
          >
            <EditIcon size={12} color={colors.textFaint} />
          </Pressable>
        ) : (
          newCount > 0 && (
            <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>
              +{newCount}
            </Text>
          )
        )}
      </XStack>
    </Pressable>
  );
}

export function SidebarNav({
  activeView,
  profiles,
  profileCounts,
  savedCount,
  onSelectView,
  onSelectProfile,
  onEditProfile,
  onNewProfile,
}: SidebarNavProps) {
  const countsMap = new Map(profileCounts.map((c) => [c.profileId, c]));
  const totalUnread = profileCounts.reduce((sum, c) => sum + c.unread, 0);
  const totalShortlisted = profileCounts.reduce((sum, c) => sum + c.shortlisted, 0);
  const totalDismissed = profileCounts.reduce((sum, c) => sum + c.dismissed, 0);

  return (
    <YStack
      width={220}
      minWidth={220}
      backgroundColor={colors.cardBackground}
      borderRightWidth={1}
      borderRightColor={colors.border}
    >
      {/* Brand */}
      <XStack paddingHorizontal={16} paddingTop={16} paddingBottom={20} alignItems="center" gap={10}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text fontFamily="$serif" fontWeight="700" fontSize={16} color={colors.accent}>
            L
          </Text>
        </View>
        <Text fontFamily="$serif" fontSize={16} fontWeight="600" color={colors.textPrimary}>
          Land<Text color={colors.accent}>Match</Text>
        </Text>
      </XStack>

      {/* Workspace */}
      <Text
        fontFamily="$mono"
        fontSize={9.5}
        textTransform="uppercase"
        letterSpacing={1.2}
        color={colors.textFaint}
        paddingHorizontal={16}
        paddingTop={12}
        paddingBottom={6}
      >
        Workspace
      </Text>

      <NavItem
        label="Matches"
        icon={<InboxIcon size={15} color={activeView === 'inbox' ? colors.textPrimary : colors.textSecondary} />}
        count={totalUnread}
        active={activeView === 'inbox'}
        onPress={() => onSelectView('inbox')}
      />
      <NavItem
        label="Saved"
        icon={<BookmarkIcon size={15} color={activeView === 'saved' ? colors.textPrimary : colors.textSecondary} />}
        count={savedCount}
        active={activeView === 'saved'}
        onPress={() => onSelectView('saved')}
      />
      <NavItem
        label="Shortlist"
        icon={<StarIcon size={15} color={activeView === 'shortlist' ? colors.textPrimary : colors.textSecondary} />}
        count={totalShortlisted}
        active={activeView === 'shortlist'}
        onPress={() => onSelectView('shortlist')}
      />
      <NavItem
        label="Dismissed"
        icon={<ArchiveIcon size={15} color={activeView === 'dismissed' ? colors.textPrimary : colors.textSecondary} />}
        count={totalDismissed}
        active={activeView === 'dismissed'}
        onPress={() => onSelectView('dismissed')}
      />

      {/* Profiles */}
      <Text
        fontFamily="$mono"
        fontSize={9.5}
        textTransform="uppercase"
        letterSpacing={1.2}
        color={colors.textFaint}
        paddingHorizontal={16}
        paddingTop={16}
        paddingBottom={6}
      >
        Profiles
      </Text>

      {profiles.map((p) => {
        const pc = countsMap.get(p.id);
        const newCount = pc?.unread ?? 0;
        return (
          <ProfileItem
            key={p.id}
            profile={p}
            newCount={newCount}
            onSelect={() => onSelectProfile(p.id)}
            onEdit={() => onEditProfile(p.id)}
          />
        );
      })}

      <Pressable onPress={onNewProfile}>
        <XStack
          paddingVertical={7}
          paddingHorizontal={16}
          marginHorizontal={8}
          marginVertical={1}
          borderRadius={6}
          alignItems="center"
          gap={8}
        >
          <PlusIcon size={15} color={colors.textSecondary} />
          <Text fontSize={12.5} color={colors.textSecondary}>New profile</Text>
        </XStack>
      </Pressable>

      {/* Account */}
      <Text
        fontFamily="$mono"
        fontSize={9.5}
        textTransform="uppercase"
        letterSpacing={1.2}
        color={colors.textFaint}
        paddingHorizontal={16}
        paddingTop={16}
        paddingBottom={6}
      >
        Account
      </Text>
      <NavItem
        label="Alert settings"
        icon={<BellIcon size={15} color={activeView === 'alert-settings' ? colors.textPrimary : colors.textSecondary} />}
        active={activeView === 'alert-settings'}
        onPress={() => onSelectView('alert-settings')}
      />
      <NavItem label="Settings" icon={<SettingsIcon size={15} color={colors.textSecondary} />} onPress={() => {}} />

      {/* User footer */}
      <XStack
        marginTop="auto"
        paddingHorizontal={16}
        paddingVertical={12}
        borderTopWidth={1}
        borderTopColor={colors.border}
        alignItems="center"
        gap={8}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.cardAlt,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text fontSize={10} fontWeight="600" color={colors.textSecondary}>
            U
          </Text>
        </View>
        <YStack>
          <Text fontSize={11.5} fontWeight="500" color={colors.textPrimary}>User</Text>
          <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>user@email.com</Text>
        </YStack>
      </XStack>
    </YStack>
  );
}
