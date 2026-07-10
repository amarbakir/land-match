import { describe, expect, it } from 'vitest';

import { createApp } from '../../../app';
import { pool } from '../../../db/client';
import * as alertRepo from '../../../repos/alertRepo';
import * as scoreRepo from '../../../repos/scoreRepo';
import { seedListing } from '../../../repos/__tests__/seed';
import { authHeaders, registerUser } from './helpers';

const app = createApp();

async function createProfile(token: string) {
  const res = await app.request('/api/v1/search-profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ name: 'Hudson Valley', criteria: {} }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { data: { id: string; userId: string } };
  return body.data;
}

describe('search profile deletion (integration)', () => {
  it('deletes a profile that has scores and alerts — the automatic state for every active profile', async () => {
    // Bug this catches: scores/alerts FKs were ON DELETE NO ACTION and remove()
    // did a bare DELETE, so once matching had scored a profile (which happens
    // automatically), deletion always tripped the FK and surfaced as a 500 —
    // the user could never delete a profile again.
    const token = await registerUser(app, 'deleter@example.com');
    const profile = await createProfile(token);
    const listingId = await seedListing('1 Del Rd, MO');
    const score = await scoreRepo.insert({
      listingId,
      searchProfileId: profile.id,
      overallScore: 80,
      componentScores: { soil: 80 },
    });
    await alertRepo.insert({
      userId: profile.userId,
      searchProfileId: profile.id,
      listingId,
      scoreId: score.id,
      channel: 'email',
    });

    const res = await app.request(`/api/v1/search-profiles/${profile.id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });

    expect(res.status).toBe(200);
    const [profiles, scores, alerts] = await Promise.all([
      pool.query('SELECT count(*)::int AS n FROM search_profiles'),
      pool.query('SELECT count(*)::int AS n FROM scores'),
      pool.query('SELECT count(*)::int AS n FROM alerts'),
    ]);
    // The profile's derived artifacts go with it — nothing orphaned behind FKs
    expect(profiles.rows[0].n).toBe(0);
    expect(scores.rows[0].n).toBe(0);
    expect(alerts.rows[0].n).toBe(0);
    // The scored listing itself is NOT the profile's — it must survive
    const listings = await pool.query('SELECT count(*)::int AS n FROM listings');
    expect(listings.rows[0].n).toBe(1);
  });

  it("refuses to delete another user's profile and leaves it intact", async () => {
    const [ownerToken, otherToken] = await Promise.all([
      registerUser(app, 'owner-del@example.com'),
      registerUser(app, 'other-del@example.com'),
    ]);
    const profile = await createProfile(ownerToken);

    const res = await app.request(`/api/v1/search-profiles/${profile.id}`, {
      method: 'DELETE',
      headers: authHeaders(otherToken),
    });

    expect(res.status).toBe(403);
    const profiles = await pool.query('SELECT count(*)::int AS n FROM search_profiles');
    expect(profiles.rows[0].n).toBe(1);
  });
});
