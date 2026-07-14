import { describe, it, expect } from 'vitest';
import { findExtractor } from '../content/extractors';

describe('findExtractor', () => {
  // Bug this catches: an extractor file exists and passes its own tests but
  // was never added to the registry, so its site silently stays unsupported
  it.each([
    ['https://www.landwatch.com/land/some-slug/12345678', 'landwatch'],
    ['https://www.zillow.com/homedetails/21881-Kale-Rd/123456789_zpid/', 'zillow'],
    ['https://www.landflip.com/land/tennessee-farm-for-sale/338266', 'landflip'],
    ['https://madison.craigslist.org/reo/d/sparta-hunting-land/7712345678.html', 'craigslist'],
  ])('routes %s to the %s extractor', (url, name) => {
    expect(findExtractor(url)?.name).toBe(name);
  });

  it('returns null for unsupported sites', () => {
    expect(findExtractor('https://www.realtor.com/realestateandhomes-detail/1')).toBeNull();
  });
});
