import { execSync } from 'node:child_process';

/** Download a URL to a local file via curl. Throws on failure. */
export function curlDownload(url: string, dest: string): void {
  console.log(`  downloading ${url}`);
  execSync(`curl -fSL -o "${dest}" "${url}"`, { stdio: ['pipe', 'pipe', 'inherit'] });
}
