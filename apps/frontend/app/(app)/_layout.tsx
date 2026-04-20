import { useEffect, useState } from 'react';

import { Redirect } from 'expo-router';
import { Spinner, YStack } from 'tamagui';

import { useSearchProfiles } from '@/src/api/hooks';
import { useAuth } from '@/src/auth/useAuth';
import { colors } from '@/src/theme/colors';
import { AppShell } from '@/src/ui/dashboard/AppShell';
import type { WorkspaceView } from '@/src/ui/dashboard/types';

import { ProfileEditorScreen } from '@/src/ui/profile/ProfileEditorScreen';

import InboxScreen from './index';
import ShortlistScreen from './shortlist';
import DismissedScreen from './dismissed';

export default function AppLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: profiles } = useSearchProfiles();
  const [view, setView] = useState<WorkspaceView>('inbox');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | undefined>(undefined);

  const handleEditProfile = (profileId: string) => {
    setEditingProfileId(profileId);
    setView('profile');
  };

  const handleNewProfile = () => {
    setEditingProfileId(undefined);
    setView('new-profile');
  };

  const handleCloseEditor = () => {
    setEditingProfileId(undefined);
    setView('inbox');
  };

  // Auto-select first profile once loaded
  useEffect(() => {
    if (!selectedProfileId && profiles && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  if (authLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor={colors.background}>
        <Spinner size="large" color={colors.accent} />
      </YStack>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <AppShell
      view={view}
      selectedProfileId={selectedProfileId}
      onChangeView={setView}
      onChangeProfile={setSelectedProfileId}
      onEditProfile={handleEditProfile}
      onNewProfile={handleNewProfile}
    >
      {view === 'inbox' && (
        <InboxScreen profileId={selectedProfileId} />
      )}
      {view === 'shortlist' && (
        <ShortlistScreen profileId={selectedProfileId} />
      )}
      {view === 'dismissed' && (
        <DismissedScreen profileId={selectedProfileId} />
      )}
      {(view === 'profile' || view === 'new-profile') && (
        <ProfileEditorScreen
          profileId={editingProfileId}
          onClose={handleCloseEditor}
        />
      )}
    </AppShell>
  );
}
