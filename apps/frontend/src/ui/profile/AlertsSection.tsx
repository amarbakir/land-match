import { View } from 'react-native';

import { RangeSlider } from './RangeSlider';
import { SectionCard } from './SectionCard';
import { ToggleButtonRow } from './ToggleButtonRow';

const FREQUENCY_OPTIONS = [
  { value: 'instant', label: 'instant' },
  { value: 'daily', label: 'daily' },
  { value: 'weekly', label: 'weekly' },
];

interface AlertsSectionProps {
  threshold: number;
  frequency: 'instant' | 'daily' | 'weekly';
  onChangeThreshold: (threshold: number) => void;
  onChangeFrequency: (frequency: 'instant' | 'daily' | 'weekly') => void;
}

export function AlertsSection({
  threshold,
  frequency,
  onChangeThreshold,
  onChangeFrequency,
}: AlertsSectionProps) {
  return (
    <SectionCard title="Alerts" hint="THRESHOLD · FREQ">
      <RangeSlider
        min={0}
        max={100}
        value={threshold}
        onChange={onChangeThreshold}
        step={5}
        formatLabel={(v) => `≥ ${v}`}
      />
      <View style={{ marginTop: 12 }}>
        <ToggleButtonRow
          options={FREQUENCY_OPTIONS}
          selected={[frequency]}
          onToggle={(v) => onChangeFrequency(v as 'instant' | 'daily' | 'weekly')}
        />
      </View>
    </SectionCard>
  );
}
