import { describe, expect, it } from 'vitest';
import { renderAlertEmail } from '../emails/renderAlert';

describe('renderAlertEmail', () => {
  it('renders HTML containing listing title and score', async () => {
    const html = await renderAlertEmail({
      userName: 'Alice',
      profileName: 'Hudson Valley',
      frequency: 'instant',
      alerts: [
        {
          listingTitle: '10 Acres in Hudson Valley',
          listingUrl: 'https://example.com/listing-1',
          price: 200000,
          acreage: 10,
          location: 'Hudson, NY',
          overallScore: 75,
          componentScores: { soil: 85, flood: 100 },
          mapUrl: 'https://www.google.com/maps?q=42.25,-73.79',
        },
      ],
    });

    expect(html).toContain('10 Acres in Hudson Valley');
    expect(html).toContain('75');
    expect(html).toContain('Hudson Valley');
    expect(html).toContain('Alice');
    expect(html).toContain('https://example.com/listing-1');
    expect(html).toContain('https://www.google.com/maps');
  });

  it('renders digest with multiple listings', async () => {
    const html = await renderAlertEmail({
      userName: null,
      profileName: 'Vermont Farms',
      frequency: 'daily',
      alerts: [
        {
          listingTitle: 'First Property',
          listingUrl: 'https://example.com/1',
          price: 100000,
          acreage: 5,
          location: 'Burlington, VT',
          overallScore: 80,
          componentScores: { soil: 90 },
          mapUrl: 'https://www.google.com/maps?q=44.47,-73.21',
        },
        {
          listingTitle: 'Second Property',
          listingUrl: 'https://example.com/2',
          price: null,
          acreage: null,
          location: 'Montpelier, VT',
          overallScore: 65,
          componentScores: { soil: 70 },
          mapUrl: 'https://www.google.com/maps',
        },
      ],
    });

    expect(html).toContain('First Property');
    expect(html).toContain('Second Property');
    expect(html).toContain('Vermont Farms');
    expect(html).toContain('Hi there');
  });
});
