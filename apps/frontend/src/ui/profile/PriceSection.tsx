import { RangeSlider } from './RangeSlider';
import { SectionCard } from './SectionCard';

interface PriceSectionProps {
  max: number;
  onChange: (value: number) => void;
}

export function PriceSection({ max, onChange }: PriceSectionProps) {
  return (
    <SectionCard title="Price ceiling" hint={`UP TO $${max}K`}>
      <RangeSlider
        min={0}
        max={1000}
        value={max}
        onChange={onChange}
        step={10}
        formatLabel={(v) => `$${v}K`}
      />
    </SectionCard>
  );
}
