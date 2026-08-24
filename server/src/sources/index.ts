import type { SourceAdapter } from '../types.js';
import { animepaheSource } from './animepahe.js';

const sources: SourceAdapter[] = [animepaheSource];

export function getSources(): SourceAdapter[] {
  return sources;
}

export function registerSource(source: SourceAdapter): void {
  sources.push(source);
}
