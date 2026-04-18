import { err, ok, type Result } from '@landmatch/api';
import type { CreateSearchProfile, UpdateSearchProfile, SearchProfileResponse } from '@landmatch/api';

import * as searchProfileRepo from '../repos/searchProfileRepo';

type ProfileRow = NonNullable<Awaited<ReturnType<typeof searchProfileRepo.findById>>>;

async function findOwned(userId: string, id: string): Promise<Result<ProfileRow>> {
  const row = await searchProfileRepo.findById(id);
  if (!row) return err('NOT_FOUND');
  if (row.userId !== userId) return err('FORBIDDEN');
  return ok(row);
}

function toResponse(row: ProfileRow): SearchProfileResponse {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    isActive: row.isActive,
    alertFrequency: row.alertFrequency,
    alertThreshold: row.alertThreshold,
    criteria: row.criteria as SearchProfileResponse['criteria'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function create(userId: string, input: CreateSearchProfile): Promise<Result<SearchProfileResponse>> {
  try {
    const row = await searchProfileRepo.insert({
      userId,
      name: input.name,
      alertFrequency: input.alertFrequency ?? 'daily',
      alertThreshold: input.alertThreshold ?? 60,
      criteria: input.criteria as Record<string, unknown>,
      isActive: input.isActive ?? true,
    });
    return ok(toResponse(row));
  } catch (error) {
    console.error('[searchProfileService.create]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function getById(userId: string, id: string): Promise<Result<SearchProfileResponse>> {
  try {
    const result = await findOwned(userId, id);
    if (!result.ok) return result;
    return ok(toResponse(result.data));
  } catch (error) {
    console.error('[searchProfileService.getById]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function listByUser(userId: string): Promise<Result<SearchProfileResponse[]>> {
  try {
    const rows = await searchProfileRepo.findByUserId(userId);
    return ok(rows.map(toResponse));
  } catch (error) {
    console.error('[searchProfileService.listByUser]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function update(
  userId: string,
  id: string,
  input: UpdateSearchProfile,
): Promise<Result<SearchProfileResponse>> {
  try {
    const owned = await findOwned(userId, id);
    if (!owned.ok) return owned;

    const row = await searchProfileRepo.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.alertFrequency !== undefined && { alertFrequency: input.alertFrequency }),
      ...(input.alertThreshold !== undefined && { alertThreshold: input.alertThreshold }),
      ...(input.criteria !== undefined && { criteria: input.criteria as Record<string, unknown> }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });

    if (!row) return err('NOT_FOUND');
    return ok(toResponse(row));
  } catch (error) {
    console.error('[searchProfileService.update]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function remove(userId: string, id: string): Promise<Result<void>> {
  try {
    const owned = await findOwned(userId, id);
    if (!owned.ok) return owned;

    await searchProfileRepo.deleteById(id);
    return ok(undefined);
  } catch (error) {
    console.error('[searchProfileService.remove]', error);
    return err('INTERNAL_ERROR');
  }
}
