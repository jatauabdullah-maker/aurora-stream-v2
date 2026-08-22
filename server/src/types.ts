export interface ResolveRequest {
  animeTitle: string;
  episodeNumber: number;
  preferredQuality?: string;
}

export interface StreamSource {
  url: string;
  quality: string;
  type: string;
  referer?: string;
  sizeMB?: number;
}

export interface SubtitleTrack {
  url: string;
  lang: string;
  label: string;
  default?: boolean;
}

export interface ResolveProgress {
  stage: 'searching' | 'found_anime' | 'finding_episode' | 'on_play_page' | 
         'solving_turnstile_animepahe' | 'on_pahewin' | 'solving_turnstile_kwik' | 
         'submitting_download' | 'complete' | 'error';
  message: string;
  animeTitle: string;
  episodeNumber: number;
}

export interface ResolveResponse {
  success: boolean;
  sources?: StreamSource[];
  subtitles?: SubtitleTrack[];
  error?: string;
  progress: ResolveProgress;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  browserConnected?: boolean;
}