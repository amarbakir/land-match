import type { EnrichmentResultMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';
import { findExtractor } from './extractors';
import { injectOverlay, updateOverlay, showError, showLoading, setRetryCallback } from './overlay/inject';

let currentUrl = window.location.href;
let enrichingUrl: string | null = null;

async function enrichCurrentPage() {
  const url = window.location.href;

  // Dedup guard: skip if already enriching this exact URL
  if (enrichingUrl === url) return;

  const extractor = findExtractor(url);
  if (!extractor) {
    console.debug('[LandMatch] No extractor matched URL:', url);
    return;
  }

  const listing = extractor.extract(document);
  if (!listing) {
    console.debug('[LandMatch] Extractor found no listing data on page');
    return;
  }

  const anchor = extractor.getOverlayAnchor(document);
  if (!anchor) {
    console.debug('[LandMatch] No overlay anchor found in DOM');
    return;
  }

  console.debug('[LandMatch] Enriching:', listing.address);

  enrichingUrl = url;
  injectOverlay(anchor);
  setRetryCallback(() => {
    enrichingUrl = null;
    enrichCurrentPage();
  });
  showLoading();

  try {
    const response = await sendMessage<EnrichmentResultMessage>({
      type: 'ENRICH_LISTING',
      payload: listing,
    });

    if (response.error || !response.payload) {
      showError(response.error ?? 'Enrichment failed');
      return;
    }

    console.debug('[LandMatch] Enrichment result:', response.payload?.listing?.address, 'score:', response.payload?.homesteadScore);
    updateOverlay(response.payload);
  } catch (error) {
    console.error('[LandMatch] Enrichment error:', error);
    showError(String(error));
  } finally {
    enrichingUrl = null;
  }
}

// Run on page load
console.debug('[LandMatch] Content script loaded on:', window.location.href);
enrichCurrentPage();

// Listen for FORCE_ENRICH from popup
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'FORCE_ENRICH') {
    enrichingUrl = null; // reset dedup guard
    enrichCurrentPage();
  }
});

// Detect SPA navigation via Navigation API (preferred) or polling fallback
if ('navigation' in window) {
  (window as any).navigation.addEventListener('navigatesuccess', () => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      enrichCurrentPage();
    }
  });
} else {
  // Fallback: poll URL every 500ms (cheap, no DOM observation overhead)
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      enrichCurrentPage();
    }
  }, 500);
}
