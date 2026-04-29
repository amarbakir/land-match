import { h } from 'preact';

interface RawValueRowProps {
  label: string;
  value: string | number | null | undefined;
  accent?: string;
}

export function RawValueRow({ label, value, accent }: RawValueRowProps) {
  return (
    <div class="raw-row">
      <span class="raw-row-label">{label}</span>
      <span class="raw-row-value" style={accent ? { color: accent } : undefined}>
        {value ?? '—'}
      </span>
    </div>
  );
}
