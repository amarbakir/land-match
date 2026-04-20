import { useProfileMatches } from '@/src/api/hooks';
import { ShortlistView } from '@/src/ui/dashboard/ShortlistView';

interface ShortlistScreenProps {
  profileId: string | null;
}

export default function ShortlistScreen({ profileId }: ShortlistScreenProps) {
  const { data } = useProfileMatches(profileId, { status: 'shortlisted', limit: 100 });
  const matches = data?.items ?? [];

  return (
    <ShortlistView
      matches={matches}
      onOpenMatch={() => {
        // Navigate to detail view — wired in dkw.4
      }}
    />
  );
}
