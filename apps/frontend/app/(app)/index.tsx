import { useCallback, useEffect, useMemo, useState } from 'react';

import type { MatchItem } from '@landmatch/api';

import {
  useProfileMatches,
  useProfileCounts,
  useSearchProfiles,
  useUpdateMatchStatus,
} from '@/src/api/hooks';
import { AppShell } from '@/src/ui/dashboard/AppShell';
import { EmptyState } from '@/src/ui/dashboard/EmptyState';
import { type FilterKey } from '@/src/ui/dashboard/FilterChips';
import { MatchListPane } from '@/src/ui/dashboard/MatchListPane';
import { ShortlistView } from '@/src/ui/dashboard/ShortlistView';
import type { WorkspaceView } from '@/src/ui/dashboard/types';
import { ProfileEditorScreen } from '@/src/ui/profile/ProfileEditorScreen';
import { Report } from '@/src/ui/report/Report';

export default function DashboardScreen() {
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

  useEffect(() => {
    if (!selectedProfileId && profiles && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

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
        <InboxView profileId={selectedProfileId} />
      )}
      {view === 'shortlist' && (
        <ShortlistPane profileId={selectedProfileId} />
      )}
      {view === 'dismissed' && (
        <DismissedPane profileId={selectedProfileId} />
      )}
      {(view === 'profile' || view === 'new-profile') && (
        <ProfileEditorScreen
          key={editingProfileId ?? 'new'}
          profileId={editingProfileId}
          onClose={handleCloseEditor}
        />
      )}
    </AppShell>
  );
}

function InboxView({ profileId }: { profileId: string | null }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);

  const queryParams = {
    ...(filter === 'strong' ? { minScore: 80 } : {}),
    ...(filter === 'shortlist' ? { status: 'shortlisted' as const } : {}),
    limit: 50,
  };

  const { data, isLoading } = useProfileMatches(profileId, queryParams);
  const { data: profileCounts = [] } = useProfileCounts();
  const { data: profiles = [] } = useSearchProfiles();
  const updateStatus = useUpdateMatchStatus();

  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const matches = data?.items ?? [];
  const total = data?.total ?? 0;

  const shortlistedIds = useMemo(
    () => new Set(matches.filter((m) => m.status === 'shortlisted').map((m) => m.scoreId)),
    [matches],
  );

  const filteredMatches = useMemo(
    () => filter === 'unread' ? matches.filter((m) => !m.readAt && m.status === 'inbox') : matches,
    [matches, filter],
  );

  const profileCount = profileCounts.find((c) => c.profileId === profileId);
  const counts = useMemo<Record<FilterKey, number>>(() => ({
    all: profileCount?.total ?? 0,
    unread: profileCount?.unread ?? 0,
    strong: matches.filter((m) => m.overallScore >= 80).length,
    shortlist: profileCount?.shortlisted ?? 0,
  }), [profileCount, matches]);

  const handleSelectMatch = useCallback(
    (match: MatchItem) => {
      setSelectedScoreId(match.scoreId);
      if (!match.readAt) {
        updateStatus.mutate({ scoreId: match.scoreId, data: { markAsRead: true } });
      }
    },
    [updateStatus],
  );

  if (!profileId) {
    return <EmptyState title="No profile selected" subtitle="Select or create a search profile to see matches." />;
  }

  return (
    <>
      <MatchListPane
        profile={profile}
        matches={filteredMatches}
        total={total}
        selectedScoreId={selectedScoreId}
        filter={filter}
        isLoading={isLoading}
        shortlistedIds={shortlistedIds}
        counts={counts}
        onSelectMatch={handleSelectMatch}
        onFilterChange={setFilter}
      />

      {selectedScoreId ? (
        <Report scoreId={selectedScoreId} />
      ) : (
        <EmptyState title="Select a match" subtitle="Choose a property from the list to view its full report." />
      )}
    </>
  );
}

function ShortlistPane({ profileId }: { profileId: string | null }) {
  const { data } = useProfileMatches(profileId, { status: 'shortlisted', limit: 100 });
  const matches = data?.items ?? [];

  return (
    <ShortlistView
      matches={matches}
      onOpenMatch={() => {}}
    />
  );
}

function DismissedPane({ profileId }: { profileId: string | null }) {
  const { data } = useProfileMatches(profileId, { status: 'dismissed', limit: 100 });
  const matches = data?.items ?? [];

  return (
    <ShortlistView
      matches={matches}
      dismissed
      onOpenMatch={() => {}}
    />
  );
}
