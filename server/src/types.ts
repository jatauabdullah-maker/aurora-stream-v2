export type Quality = '360p' | '720p' | '1080p';

export interface ResolveRequest {
  animeTitle: string;
  anilistId?: number;
  episodeNumber: number;
  preferredQuality?: Quality;
}

export interface BatchResolveRequest {
  animeTitle: string;
  episodes: number[];
  preferredQuality?: Quality;
}

export interface StreamSource {
  url: string;
  quality: string;
  type: 'mp4';
  referer: string;
  filename?: string;
  sizeMB?: number;
}

export type PipelineStage =
  | 'queued'
  | 'searching'
  | 'found_anime'
  | 'finding_episode'
  | 'on_play_page'
  | 'solving_protection'
  | 'on_redirect'
  | 'resolving_link'
  | 'downloading'
  | 'complete'
  | 'error';

export interface ResolveProgress {
  stage: PipelineStage;
  message: string;
  animeTitle: string;
  episodeNumber: number;
}

export interface EpisodeResult {
  episodeNumber: number;
  success: boolean;
  sources?: StreamSource[];
  availableQualities?: string[];
  error?: string;
  fromCache?: boolean;
}

export interface ResolveResponse {
  success: boolean;
  sources?: StreamSource[];
  availableQualities?: string[];
  error?: string;
  fromCache?: boolean;
  progress: ResolveProgress;
}

export interface BatchEpisodeStatus {
  episodeNumber: number;
  status: 'pending' | 'resolving' | 'completed' | 'failed' | 'cancelled';
  progress?: ResolveProgress;
  result?: EpisodeResult;
}

export interface BatchJobState {
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  episodes: BatchEpisodeStatus[];
  completedCount: number;
  failedCount: number;
  cancelled?: boolean;
  error?: string;
}

export interface SingleJobState {
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: ResolveProgress;
  result?: ResolveResponse;
  error?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  browserConnected: boolean;
  queueDepth: number;
  cacheSize: number;
  mistralKeysAvailable: number;
  uptimeSec: number;
}

export interface SourceAdapter {
  name: string;
  resolve(
    ctx: ResolverContext,
    request: ResolveRequest,
    onProgress: (p: ResolveProgress) => void
  ): Promise<EpisodeResult>;
}

export interface ResolverContext {
  page: import('patchright').Page;
  solveTurnstile: (page: import('patchright').Page) => Promise<boolean>;
  askBrain: (prompt: BrainQuery) => Promise<BrainAnswer | null>;
  log: (msg: string) => void;
}

export interface BrainQuery {
  situation: string;
  url: string;
  title: string;
  htmlSnippet: string;
  goal: string;
}

export interface BrainAnswer {
  action: 'click' | 'navigate' | 'wait' | 'extract' | 'give_up';
  selector?: string;
  url?: string;
  waitMs?: number;
  extracted?: string;
  reason: string;
}
