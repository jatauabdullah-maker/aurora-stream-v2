import { resolveStream } from './resolver.js';
import type { ResolveRequest, ResolveProgress } from './types.js';

async function testResolve() {
  const args = process.argv.slice(2);
  const animeTitle = args[0] || 'One Piece';
  const episodeNumber = parseInt(args[1] || '1174', 10);
  const preferredQuality = args[2] || '1080p';
  
  console.log(`Testing resolve for: "${animeTitle}" Episode ${episodeNumber} (${preferredQuality})`);
  console.log('─'.repeat(60));
  
  const request: ResolveRequest = { animeTitle, episodeNumber, preferredQuality };
  
  const onProgress = (progress: ResolveProgress) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${timestamp}] ${progress.stage.toUpperCase()}: ${progress.message}`);
  };
  
  try {
    const result = await resolveStream(request, onProgress);
    
    console.log('─'.repeat(60));
    if (result.success && result.sources?.length) {
      console.log('✅ SUCCESS!');
      console.log(`   URL: ${result.sources[0].url}`);
      console.log(`   Quality: ${result.sources[0].quality}`);
      console.log(`   Type: ${result.sources[0].type}`);
      console.log(`   Referer: ${result.sources[0].referer}`);
      console.log(`   Filename hint: ${result.sources[0].url.split('/').pop()}`);
    } else {
      console.log('❌ FAILED!');
      console.log(`   Error: ${result.error}`);
    }
    
    if (result.progress) {
      console.log(`   Final stage: ${result.progress.stage} - ${result.progress.message}`);
    }
    
  } catch (error) {
    console.error('❌ Test crashed:', error);
  }
  
  process.exit(0);
}

testResolve();