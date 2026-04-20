import { DualRangeSlider } from './DualRangeSlider';
import { SectionCard } from './SectionCard';

interface AcreageSectionProps {
  min: number;
  max: number;
  onChange: (value: [number, number]) => void;
}

export function AcreageSection({ min, max, onChange }: AcreageSectionProps) {
  return (
    <SectionCard title="Acreage" hint={`${min} – ${max} ACRES`}>
      <DualRangeSlider
        min={0}
        max={200}
        value={[min, max]}
        onChange={onChange}
        step={1}
        formatLabel={(lo, hi) => `${lo} – ${hi} ac`}
      />
    </SectionCard>
  );
}
