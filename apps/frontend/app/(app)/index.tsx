import { useCallback, useMemo, useState } from 'react';

import type { MatchItem } from '@landmatch/api';
import { Text, YStack } from 'tamagui';

import {
  useProfileMatches,
  useProfileCounts,
  useSearchProfiles,
  useUpdateMatchStatus,
} from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';
import { EmptyState } from '@/src/ui/dashboard/EmptyState';
import { type FilterKey } from '@/src/ui/dashboard/FilterChips';
import { MatchListPane } from '@/src/ui/dashboard/MatchListPane';

interface InboxScreenProps {
  profileId: string | null;
}

export default function InboxScreen({ profileId }: InboxScreenProps) {
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

  // Client-side filtering for unread
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

      {/* Detail pane stub — replaced by dkw.4 */}
      <YStack flex={1} justifyContent="center" alignItems="center" gap={10}>
        <Text fontSize={13} color={colors.textFaint}>
          {selectedScoreId ? 'Property report coming in dkw.4' : 'Select a match to view details'}
        </Text>
      </YStack>
    </>
  );
}
