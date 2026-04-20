import { SectionCard } from './SectionCard';
import { ToggleButtonRow, toggleValue } from './ToggleButtonRow';

const INFRA_OPTIONS = [
  { value: 'well', label: 'well' },
  { value: 'septic', label: 'septic' },
  { value: 'electric', label: 'electric' },
  { value: 'paved road', label: 'paved road' },
  { value: 'internet', label: 'internet' },
  { value: 'outbuildings', label: 'outbuildings' },
];

interface InfraSectionProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function InfraSection({ selected, onChange }: InfraSectionProps) {
  return (
    <SectionCard title="Infrastructure wish-list" hint="BOOSTS · NOT REQUIRED">
      <ToggleButtonRow
        options={INFRA_OPTIONS}
        selected={selected}
        onToggle={(v) => onChange(toggleValue(selected, v))}
      />
    </SectionCard>
  );
}
