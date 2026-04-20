import { err, ok, type Result } from '@landmatch/api';
import type { MatchItem, PaginatedMatches, MatchFilters, ProfileCounts, UpdateMatchStatus } from '@landmatch/api';

import * as scoreRepo from '../repos/scoreRepo';
import * as searchProfileRepo from '../repos/searchProfileRepo';

const SOIL_CLASS_LABELS: Record<number, string> = {
  1: 'Class I', 2: 'Class II', 3: 'Class III', 4: 'Class IV',
  5: 'Class V', 6: 'Class VI', 7: 'Class VII', 8: 'Class VIII',
};

function toMatchItem(row: Record<string, unknown>): MatchItem {
  const soilClass = row.soilClass as number | null;
  return {
    scoreId: row.scoreId as string,
    listingId: row.listingId as string,
    overallScore: row.overallScore as number,
    componentScores: row.componentScores as MatchItem['componentScores'],
    llmSummary: (row.llmSummary as string) ?? null,
    status: row.status as MatchItem['status'],
    readAt: row.readAt ? (row.readAt as Date).toISOString() : null,
    scoredAt: (row.scoredAt as Date).toISOString(),
    title: (row.title as string) ?? null,
    address: row.address as string,
    price: (row.price as number) ?? null,
    acreage: (row.acreage as number) ?? null,
    source: (row.source as string) ?? null,
    url: (row.url as string) ?? null,
    lat: (row.lat as number) ?? null,
    lng: (row.lng as number) ?? null,
    soilClass,
    soilClassLabel: soilClass ? (SOIL_CLASS_LABELS[soilClass] ?? null) : null,
    primeFarmland: soilClass ? soilClass <= 2 : null,
    floodZone: (row.floodZone as string) ?? null,
    zoning: (row.zoning as string) ?? null,
  };
}

export async function getMatches(
  userId: string,
  profileId: string,
  filters: MatchFilters,
): Promise<Result<PaginatedMatches>> {
  try {
    const profile = await searchProfileRepo.findById(profileId);
    if (!profile) return err('NOT_FOUND');
    if (profile.userId !== userId) return err('FORBIDDEN');

    const { rows, total } = await scoreRepo.findMatchesByProfile(profileId, {
      status: filters.status,
      minScore: filters.minScore,
      sort: filters.sort,
      sortDir: filters.sortDir,
      limit: filters.limit,
      offset: filters.offset,
    });

    return ok({
      items: rows.map(toMatchItem),
      total,
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
    });
  } catch (error) {
    console.error('[matchService.getMatches]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function updateMatchStatus(
  userId: string,
  scoreId: string,
  input: UpdateMatchStatus,
): Promise<Result<{ scoreId: string; status: string; readAt: string | null }>> {
  try {
    const score = await scoreRepo.findById(scoreId);
    if (!score) return err('NOT_FOUND');

    const profile = await searchProfileRepo.findById(score.searchProfileId);
    if (!profile) return err('NOT_FOUND');
    if (profile.userId !== userId) return err('FORBIDDEN');

    const updates: { status?: string; readAt?: Date } = {};
    if (input.status) updates.status = input.status;
    if (input.markAsRead && !score.readAt) updates.readAt = new Date();

    const updated = await scoreRepo.updateStatus(scoreId, updates);
    if (!updated) return err('NOT_FOUND');

    return ok({
      scoreId: updated.id,
      status: updated.status,
      readAt: updated.readAt ? updated.readAt.toISOString() : null,
    });
  } catch (error) {
    console.error('[matchService.updateMatchStatus]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function getProfileCounts(userId: string): Promise<Result<ProfileCounts>> {
  try {
    const profiles = await searchProfileRepo.findByUserId(userId);
    const profileIds = profiles.map(p => p.id);
    const counts = await scoreRepo.getProfileCounts(profileIds);

    const countsMap = new Map(counts.map(c => [c.profileId, c]));
    const result = profileIds.map(id => countsMap.get(id) ?? {
      profileId: id,
      total: 0,
      unread: 0,
      shortlisted: 0,
    });

    return ok(result);
  } catch (error) {
    console.error('[matchService.getProfileCounts]', error);
    return err('INTERNAL_ERROR');
  }
}
