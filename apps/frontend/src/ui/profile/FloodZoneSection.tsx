import { SectionCard } from './SectionCard';
import { ToggleButtonRow, toggleValue } from './ToggleButtonRow';

const FLOOD_OPTIONS = [
  { value: 'X', label: 'Zone X' },
  { value: 'A', label: 'Zone A' },
  { value: 'AE', label: 'Zone AE' },
  { value: 'VE', label: 'Zone VE' },
  { value: 'D', label: 'Zone D' },
];

interface FloodZoneSectionProps {
  excluded: string[];
  onChange: (excluded: string[]) => void;
}

export function FloodZoneSection({ excluded, onChange }: FloodZoneSectionProps) {
  return (
    <SectionCard title="Exclude flood zones" hint="HARD FILTER">
      <ToggleButtonRow
        options={FLOOD_OPTIONS}
        selected={excluded}
        onToggle={(v) => onChange(toggleValue(excluded, v))}
        variant="danger"
      />
    </SectionCard>
  );
}
