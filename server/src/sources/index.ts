import type { SourceAdapter } from '../types.js';
import { tryembedSource } from './tryembed.js';
import { animepaheSource } from './animepahe.js';

// Order matters: tryembed first (works from datacenter IPs, no Cloudflare walls),
// animepahe as fallback (only works from residential IPs).
const sources: SourceAdapter[] = [tryembedSource, animepaheSource];

export function getSources(): SourceAdapter[] {
  return sources;
}

export function registerSource(source: SourceAdapter): void {
  sources.push(source);
}
