import { execFileSync } from 'node:child_process';

/**
 * Download a URL to a local file via curl. Throws on failure.
 * execFileSync with an arg array (no shell): metacharacters in a source URL
 * or dest path can't be interpreted — these come from hardcoded manifests
 * today, but the sink shouldn't rely on that.
 */
export function curlDownload(url: string, dest: string): void {
  console.log(`  downloading ${url}`);
  execFileSync('curl', ['-fSL', '-o', dest, url], { stdio: ['pipe', 'pipe', 'inherit'] });
}
