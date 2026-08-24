import type { SourceAdapter } from '../types.js';
import { tryembedSource } from './tryembed.js';
import { animepaheSource } from './animepahe.js';

// Order matters: tryembed first (no Cloudflare walls), animepahe as fallback
// (only works from residential IPs). Filter via SOURCES env (comma-separated).
const all: SourceAdapter[] = [tryembedSource, animepaheSource];
const enabled = (process.env.SOURCES || 'tryembed,animepahe')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const sources: SourceAdapter[] = all.filter((s) => enabled.includes(s.name));

export function getSources(): SourceAdapter[] {
  return sources;
}

export function registerSource(source: SourceAdapter): void {
  sources.push(source);
}
