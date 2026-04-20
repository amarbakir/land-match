import { View } from 'react-native';

import type { ProfileCounts, SearchProfileResponse } from '@landmatch/api';
import { XStack, YStack } from 'tamagui';

import { useProfileCounts, useSearchProfiles } from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';

import { SidebarNav } from './SidebarNav';
import { Topbar } from './Topbar';

type WorkspaceView = 'inbox' | 'shortlist' | 'dismissed';

interface AppShellProps {
  view: WorkspaceView;
  selectedProfileId: string | null;
  onChangeView: (view: WorkspaceView) => void;
  onChangeProfile: (profileId: string) => void;
  children: React.ReactNode;
}

export function AppShell({
  view,
  selectedProfileId,
  onChangeView,
  onChangeProfile,
  children,
}: AppShellProps) {
  const { data: profiles = [] } = useSearchProfiles();
  const { data: profileCounts = [] } = useProfileCounts();

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? profiles[0] ?? null;

  const totalUnread = profileCounts.reduce((sum, c) => sum + c.unread, 0);
  const totalShortlisted = profileCounts.reduce((sum, c) => sum + c.shortlisted, 0);

  return (
    <XStack flex={1} backgroundColor={colors.background}>
      <SidebarNav
        activeView={view}
        profiles={profiles}
        profileCounts={profileCounts}
        totalUnread={totalUnread}
        totalShortlisted={totalShortlisted}
        totalDismissed={0}
        onSelectView={onChangeView}
        onSelectProfile={(id) => {
          onChangeProfile(id);
          onChangeView('inbox');
        }}
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
