import type { EnrichmentResultMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';
import { findExtractor } from './extractors';
import { injectOverlay, updateOverlay, showError, showLoading } from './overlay/inject';

let currentUrl = window.location.href;

async function enrichCurrentPage() {
  const extractor = findExtractor(currentUrl);
  if (!extractor) return;

  const listing = extractor.extract(document);
  if (!listing) return;

  const anchor = extractor.getOverlayAnchor(document);
  if (!anchor) return;

  injectOverlay(anchor);
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

    updateOverlay(response.payload);
  } catch (error) {
    showError(String(error));
  }
}

// Run on page load
enrichCurrentPage();

// Watch for SPA-style navigation (URL changes without full reload)
const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    enrichCurrentPage();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
