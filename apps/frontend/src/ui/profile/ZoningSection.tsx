import { SectionCard } from './SectionCard';
import { ToggleButtonRow, toggleValue } from './ToggleButtonRow';

const ZONING_OPTIONS = [
  { value: 'agricultural', label: 'agricultural' },
  { value: 'residential-agricultural', label: 'residential-agricultural' },
  { value: 'rural-residential', label: 'rural-residential' },
  { value: 'conservation', label: 'conservation' },
];

interface ZoningSectionProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function ZoningSection({ selected, onChange }: ZoningSectionProps) {
  return (
    <SectionCard title="Preferred zoning" hint="NORMALIZED">
      <ToggleButtonRow
        options={ZONING_OPTIONS}
        selected={selected}
        onToggle={(v) => onChange(toggleValue(selected, v))}
      />
    </SectionCard>
  );
}
