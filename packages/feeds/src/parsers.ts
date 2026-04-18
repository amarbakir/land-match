export function extractPrice(text: string): number | undefined {
  const match = text.match(/\$[\d,]+/);
  if (!match) return undefined;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || undefined;
}

export function extractAcreage(text: string): number | undefined {
  const match = text.match(/([\d.]+)\s*acres?/i);
  if (!match) return undefined;
  return parseFloat(match[1]) || undefined;
}

export function extractCountyState(text: string): { county?: string; state?: string } {
  const match = text.match(/in\s+([A-Za-z\s]+?)\s+County,\s*([A-Z]{2})/i);
  if (!match) return {};
  return { county: `${match[1]} County`, state: match[2] };
}
