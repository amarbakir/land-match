import dotenv from 'dotenv';
dotenv.config({ path: '../../apps/server/.env' });

import { REGIONS, type SourceName } from './types';
import { ensurePostGIS, getPool } from './lib/postgis';
import { loadPrism } from './sources/prism';
import { loadElevation } from './sources/elevation';
import { loadWetlands } from './sources/wetlands';

const LOADERS: Record<SourceName, (regionName: string) => Promise<void>> = {
  prism: loadPrism,
  elevation: loadElevation,
  wetlands: loadWetlands,
};

export function parseArg(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) return args[i + 1];
    if (args[i].startsWith(`${name}=`)) return args[i].slice(name.length + 1);
  }
  return undefined;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');

  const regionName = parseArg(args, '--region') ?? 'northeast';
  const sourceName = parseArg(args, '--source');

  if (!REGIONS[regionName]) {
    console.error(`Unknown region: ${regionName}. Available: ${Object.keys(REGIONS).join(', ')}`);
    process.exit(1);
  }

  const pool = getPool();
  await ensurePostGIS(pool);
  await pool.end();

  if (sourceName) {
    if (!(sourceName in LOADERS)) {
      console.error(`Unknown source: ${sourceName}. Available: ${Object.keys(LOADERS).join(', ')}`);
      process.exit(1);
    }
    await LOADERS[sourceName as SourceName](regionName);
  } else {
    for (const [name, loader] of Object.entries(LOADERS)) {
      console.log(`\n=== Loading ${name} ===`);
      await loader(regionName);
    }
  }

  console.log('\n[geodata] Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
