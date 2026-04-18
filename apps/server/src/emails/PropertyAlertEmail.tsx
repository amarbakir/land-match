import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface AlertItem {
  listingTitle: string;
  listingUrl: string;
  price: number | null;
  acreage: number | null;
  location: string;
  overallScore: number;
  componentScores: Record<string, number>;
  mapUrl: string;
}

export interface PropertyAlertEmailProps {
  userName: string | null;
  profileName: string;
  alerts: AlertItem[];
  frequency: 'instant' | 'daily' | 'weekly';
}

function formatPrice(price: number | null): string {
  if (price == null) return 'Price N/A';
  return `$${price.toLocaleString()}`;
}

function formatAcreage(acreage: number | null): string {
  if (acreage == null) return '';
  return `${acreage} acres`;
}

function scoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const details = [formatPrice(alert.price), formatAcreage(alert.acreage)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Section style={cardStyle}>
      <Heading as="h3" style={{ margin: '0 0 4px', fontSize: '18px', color: '#1a1a1a' }}>
        <Link href={alert.listingUrl} style={{ color: '#1a1a1a', textDecoration: 'none' }}>
          {alert.listingTitle}
        </Link>
      </Heading>

      {details && <Text style={{ margin: '0 0 4px', color: '#555', fontSize: '14px' }}>{details}</Text>}
      <Text style={{ margin: '0 0 8px', color: '#777', fontSize: '13px' }}>{alert.location}</Text>

      <Text style={{ margin: '0 0 8px' }}>
        <span
          style={{
            backgroundColor: scoreColor(alert.overallScore),
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          Score: {alert.overallScore}
        </span>
      </Text>

      <Text style={{ margin: '0 0 12px', fontSize: '12px', color: '#777' }}>
        {Object.entries(alert.componentScores)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ')}
      </Text>

      <Section>
        <Link href={alert.listingUrl} style={buttonStyle}>
          View Listing
        </Link>
        <Link href={alert.mapUrl} style={{ ...buttonStyle, backgroundColor: '#6b7280', marginLeft: '8px' }}>
          View on Map
        </Link>
      </Section>
    </Section>
  );
}

export function PropertyAlertEmail({ userName, profileName, alerts, frequency }: PropertyAlertEmailProps) {
  const greeting = userName ? `Hi ${userName}` : 'Hi there';
  const frequencyLabel = frequency === 'instant' ? 'new' : frequency;
  const previewText = `${alerts.length} ${frequencyLabel} match${alerts.length === 1 ? '' : 'es'} for ${profileName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading as="h1" style={{ fontSize: '24px', color: '#16a34a', margin: '0 0 16px' }}>
            LandMatch
          </Heading>

          <Text style={{ fontSize: '16px', color: '#333', margin: '0 0 16px' }}>
            {greeting}, here {alerts.length === 1 ? 'is' : 'are'} your {frequencyLabel} match
            {alerts.length === 1 ? '' : 'es'} for <strong>{profileName}</strong>:
          </Text>

          {alerts.map((alert, i) => (
            <AlertCard key={i} alert={alert} />
          ))}

          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />

          <Text style={{ fontSize: '12px', color: '#999', textAlign: 'center' as const }}>
            You're receiving this because you have an active search profile on LandMatch.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: '#f4f4f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const containerStyle = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '24px',
  maxWidth: '600px',
  borderRadius: '8px',
};

const cardStyle = {
  backgroundColor: '#fafafa',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '12px',
};

const buttonStyle = {
  backgroundColor: '#16a34a',
  color: '#fff',
  padding: '8px 16px',
  borderRadius: '4px',
  fontSize: '14px',
  fontWeight: 600 as const,
  textDecoration: 'none' as const,
  display: 'inline-block' as const,
};
