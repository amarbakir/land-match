import { sendMessage } from '../shared/messages';
import { findExtractor } from './extractors';

let currentUrl = window.location.href;
let enrichingUrl: string | null = null;

function processCurrentPage() {
  const url = window.location.href;

  if (enrichingUrl === url) return;

  const extractor = findExtractor(url);
  if (!extractor) {
    // Not a listing page — notify background
    sendMessage({ type: 'PAGE_CHANGED', payload: { isListing: false, url } });
    return;
  }

  const listing = extractor.extract(document);
  if (!listing) {
    sendMessage({ type: 'PAGE_CHANGED', payload: { isListing: false, url } });
    return;
  }

  console.log('[LandMatch] Enriching:', listing.address);
  enrichingUrl = url;

  sendMessage({ type: 'ENRICH_LISTING', payload: listing })
    .finally(() => { enrichingUrl = null; });
}

// Run on page load
console.log('[LandMatch] Content script loaded on:', window.location.href);
processCurrentPage();

// Detect SPA navigation
if ('navigation' in window) {
  (window as any).navigation.addEventListener('navigatesuccess', () => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      processCurrentPage();
    }
  });
} else {
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      processCurrentPage();
    }
  }, 500);
}
