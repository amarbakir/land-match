import { h } from 'preact';

interface BrandLogoProps {
  size?: 'sm' | 'md';
}

export function BrandLogo({ size = 'sm' }: BrandLogoProps) {
  const markSize = size === 'md' ? 26 : 22;
  const fontSize = size === 'md' ? 16 : 14;

  return (
    <>
      <div class="brand-mark" style={{ width: markSize, height: markSize, fontSize }}>L</div>
      <span class="brand" style={{ fontSize }}><span>Land<em>Match</em></span></span>
    </>
  );
}
