import { View } from 'react-native';

import type { ProfileCounts, SearchProfileResponse } from '@landmatch/api';
import { XStack, YStack } from 'tamagui';

import { useProfileCounts, useSearchProfiles } from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';

import { SidebarNav } from './SidebarNav';
import { Topbar } from './Topbar';
import type { WorkspaceView } from './types';

interface AppShellProps {
  view: WorkspaceView;
  selectedProfileId: string | null;
  onChangeView: (view: WorkspaceView) => void;
  onChangeProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onNewProfile: () => void;
  children: React.ReactNode;
}

export function AppShell({
  view,
  selectedProfileId,
  onChangeView,
  onChangeProfile,
  onEditProfile,
  onNewProfile,
  children,
}: AppShellProps) {
  const { data: profiles = [] } = useSearchProfiles();
  const { data: profileCounts = [] } = useProfileCounts();

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? profiles[0] ?? null;

  const totalUnread = profileCounts.reduce((sum, c) => sum + c.unread, 0);

  return (
    <XStack flex={1} backgroundColor={colors.background}>
      <SidebarNav
        activeView={view}
        profiles={profiles}
        profileCounts={profileCounts}
        onSelectView={onChangeView}
        onSelectProfile={(id) => {
          onChangeProfile(id);
          onChangeView('inbox');
        }}
        onEditProfile={onEditProfile}
        onNewProfile={onNewProfile}
      />
      <YStack flex={1}>
        <Topbar
          view={view}
          profile={selectedProfile}
          hasNotifications={totalUnread > 0}
        />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {children}
        </View>
      </YStack>
    </XStack>
  );
}
