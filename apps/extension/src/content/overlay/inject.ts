import { render, h } from 'preact';
import type { EnrichListingResponse } from '@landmatch/api';

import { ScoreCard } from './ScoreCard';

const HOST_ID = 'landmatch-overlay';

let shadowRoot: ShadowRoot | null = null;

export function injectOverlay(anchor: Element) {
  // Remove existing overlay if present
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'all: initial; display: block; margin: 12px 0;';

  shadowRoot = host.attachShadow({ mode: 'closed' });

  anchor.insertAdjacentElement('afterend', host);
}

export function showLoading() {
  if (!shadowRoot) return;
  render(h(ScoreCard, { state: 'loading' }), shadowRoot);
}

let retryCallback: (() => void) | null = null;

export function setRetryCallback(cb: () => void) {
  retryCallback = cb;
}

export function showError(error: string) {
  if (!shadowRoot) return;
  render(
    h(ScoreCard, {
      state: 'error',
      error,
      onRetry: () => retryCallback?.(),
    }),
    shadowRoot,
  );
}

export function updateOverlay(data: EnrichListingResponse) {
  if (!shadowRoot) return;
  render(h(ScoreCard, { state: 'loaded', data }), shadowRoot);
}
