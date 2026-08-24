import 'dotenv/config';
import { resolveEpisode } from './resolver.js';
import { closeBrowser } from './browser.js';
import type { ResolveRequest } from './types.js';

const args = process.argv.slice(2);
const animeTitle = args[0] || 'FLCL';
const episodeNumber = parseInt(args[1] || '1', 10);
const preferredQuality = (args[2] as ResolveRequest['preferredQuality']) || '720p';

async function main() {
  console.log(`Testing resolve: "${animeTitle}" EP${episodeNumber} (${preferredQuality})`);
  console.log('─'.repeat(60));

  const started = Date.now();
  try {
    const result = await resolveEpisode(
      { animeTitle, episodeNumber, preferredQuality },
      (p) => console.log(`[${p.stage}] ${p.message}`)
    );

    console.log('─'.repeat(60));
    if (result.success && result.sources?.length) {
      const s = result.sources[0];
      console.log(`SUCCESS in ${Math.round((Date.now() - started) / 1000)}s`);
      console.log(`  URL:      ${s.url}`);
      console.log(`  Filename: ${s.filename}`);
      console.log(`  Quality:  ${s.quality}${s.sizeMB ? ` (${s.sizeMB}MB)` : ''}`);
      console.log(`  Serve at: <RESOLVER_BASE>${s.url}`);
    } else {
      console.log(`FAILED: ${result.error}`);
      if (result.availableQualities?.length) {
        console.log(`  Available qualities: ${result.availableQualities.join(', ')}`);
      }
    }
  } finally {
    await closeBrowser();
  }
  process.exit(0);
}

void main();
