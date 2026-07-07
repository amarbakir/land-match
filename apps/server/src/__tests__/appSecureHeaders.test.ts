import { describe, expect, it } from 'vitest';

import { createApp } from '../app';

describe('security headers', () => {
  // Bug this catches: if the secureHeaders() middleware is dropped from createApp
  // (land-match-cge.3), every response ships without nosniff / clickjacking
  // protection and nothing else in the suite would notice.
  it('sets baseline security headers on every response', async () => {
    const app = createApp();

    const res = await app.request('/health');

    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
  });
});
