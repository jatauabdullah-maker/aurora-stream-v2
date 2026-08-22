import type { AnimeSummary, AnimeDetails, Episode, SearchFilters } from '../types'

const API = 'https://graphql.anilist.co'

// ─── Shared query fragments ─────────────────────────────────────────────────

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { extraLarge large }
  bannerImage
  averageScore
  seasonYear
  startDate { year }
  format
  status
  genres
  episodes
  description(asHtml: false)
  trailer { id site }
  studios(isMain: true) { nodes { name } }
`

// ─── Raw response typings ────────────────────────────────────────────────────

interface ALMedia {
  id: number
  title: { romaji?: string; english?: string; native?: string }
  coverImage?: { extraLarge?: string; large?: string }
  bannerImage?: string
  averageScore?: number
  seasonYear?: number
  startDate?: { year?: number }
  format?: string
  status?: string
  genres?: string[]
  episodes?: number
  description?: string
  trailer?: { id?: string; site?: string }
  studios?: { nodes?: { name: string }[] }
  airingSchedule?: { nodes?: { episode: number; airingAt: number }[] }
  nextAiringEpisode?: { episode: number; airingAt: number }
}

interface ALResponse<T> {
  data?: T
  errors?: { message: string }[]
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
  const json = (await res.json()) as ALResponse<T>
  if (json.errors?.length) throw new Error(json.errors[0].message)
  if (!json.data) throw new Error('Empty AniList response')
  return json.data
}

// ─── Mappers ────────────────────────────────────────────────────────────────

function formatAniListStatus(s?: string): string | undefined {
  if (!s) return undefined
  const map: Record<string, string> = {
    RELEASING: 'Ongoing',
    FINISHED: 'Completed',
    NOT_YET_RELEASED: 'Upcoming',
    CANCELLED: 'Cancelled',
    HIATUS: 'Hiatus',
  }
  return map[s] ?? s
}

function mapSummary(m: ALMedia): AnimeSummary {
  const title = m.title.english || m.title.romaji || m.title.native || 'Unknown'
  return {
    id: `al-${m.id}`,
    title,
    poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
    banner: m.bannerImage || undefined,
    rating: m.averageScore != null ? m.averageScore / 10 : undefined,
    year: m.seasonYear ?? m.startDate?.year ?? undefined,
    type: m.format,
    status: formatAniListStatus(m.status),
    genres: m.genres ?? [],
    episodeCount: m.episodes ?? undefined,
  }
}

function stripHtml(html?: string): string | undefined {
  if (!html) return undefined
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function detailsBanner(m: ALMedia): string | undefined {
  return m.bannerImage || m.coverImage?.extraLarge || m.coverImage?.large || undefined
}

// Placeholder episode list constructed from the count / airing schedule.
// Real stream sources are never part of AniList — your backend resolves episodes
// by matching title + episode number.
function mapEpisodes(m: ALMedia): Episode[] {
  const episodes: Episode[] = []
  const count = m.episodes ?? m.nextAiringEpisode?.episode ?? m.airingSchedule?.nodes?.length ?? 0

  if (count > 0 && count <= 500) {
    for (let i = 1; i <= count; i++) {
      const aired = m.airingSchedule?.nodes?.find((n) => n.episode === i)
      episodes.push({
        id: `al-${m.id}-e${i}`,
        number: i,
        season: 1,
        airedAt: aired ? new Date(aired.airingAt * 1000).toISOString() : undefined,
        title: `Episode ${i}`,
      })
    }
  }
  return episodes
}

function mapDetails(m: ALMedia): AnimeDetails {
  const s = mapSummary(m)
  return {
    ...s,
    banner: detailsBanner(m),
    synopsis: stripHtml(m.description),
    studio: m.studios?.nodes?.[0]?.name,
    trailerUrl:
      m.trailer?.site === 'youtube' && m.trailer.id
        ? `https://www.youtube.com/embed/${m.trailer.id}`
        : undefined,
    episodes: mapEpisodes(m),
    score: m.averageScore != null ? m.averageScore / 10 : undefined,
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function alTrending(page = 1, perPage = 15): Promise<AnimeSummary[]> {
  const data = await gql<{ Page: { media: ALMedia[] } }>(
    `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { page, perPage }
  )
  return data.Page.media.map(mapSummary)
}

export async function alPopular(page = 1, perPage = 15): Promise<AnimeSummary[]> {
  const data = await gql<{ Page: { media: ALMedia[] } }>(
    `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} }
      }
    }`,
    { page, perPage }
  )
  return data.Page.media.map(mapSummary)
}

export async function alNewReleases(page = 1, perPage = 15): Promise<AnimeSummary[]> {
  const data = await gql<{ Page: { media: ALMedia[] } }>(
    `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(sort: START_DATE_DESC, type: ANIME, isAdult: false, status: RELEASING) {
          ${MEDIA_FIELDS}
        }
      }
    }`,
    { page, perPage }
  )
  return data.Page.media.map(mapSummary)
}

export async function alSearch(
  filters: SearchFilters
): Promise<{ items: AnimeSummary[]; page: number; totalPages: number }> {
  const conditions: string[] = ['type: ANIME', 'isAdult: false']
  const varDefs: string[] = ['$page: Int', '$perPage: Int']
  const vars: Record<string, unknown> = { page: filters.page ?? 1, perPage: 20 }
  let sortClause = 'POPULARITY_DESC'

  if (filters.q) {
    conditions.push('search: $search')
    varDefs.push('$search: String')
    vars.search = filters.q
    sortClause = 'SEARCH_MATCH'
  }
  if (filters.genre) {
    conditions.push('genre: $genre')
    varDefs.push('$genre: String')
    vars.genre = filters.genre
  }
  if (filters.year) {
    conditions.push('seasonYear: $year')
    varDefs.push('$year: Int')
    vars.year = filters.year
  }
  if (filters.status) {
    const map: Record<string, string> = {
      Ongoing: 'RELEASING',
      Completed: 'FINISHED',
      Upcoming: 'NOT_YET_RELEASED',
    }
    conditions.push('status: $status')
    varDefs.push('$status: MediaStatus')
    vars.status = map[filters.status] ?? 'FINISHED'
  }

  const data = await gql<{
    Page: { media: ALMedia[]; pageInfo: { currentPage: number; lastPage: number } }
  }>(
    `query (${varDefs.join(', ')}) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { currentPage lastPage hasNextPage }
        media(sort: ${sortClause}, ${conditions.join(', ')}) { ${MEDIA_FIELDS} }
      }
    }`,
    vars
  )
  return {
    items: data.Page.media.map(mapSummary),
    page: data.Page.pageInfo.currentPage,
    totalPages: data.Page.pageInfo.lastPage,
  }
}

export async function alGenres(): Promise<string[]> {
  const data = await gql<{ GenreCollection: string[] }>(`{ GenreCollection }`)
  return (data.GenreCollection ?? []).filter((g) => g !== 'Hentai')
}

export async function alJustAired(perPage = 15): Promise<AnimeSummary[]> {
  const now = Math.floor(Date.now() / 1000)
  const weekAgo = now - 7 * 24 * 60 * 60
  const data = await gql<{
    Page: { airingSchedules: { episode: number; airingAt: number; media: ALMedia | null }[] }
  }>(
    `query ($perPage: Int, $now: Int, $weekAgo: Int) {
      Page(page: 1, perPage: $perPage) {
        airingSchedules(airingAt_greater: $weekAgo, airingAt_lesser: $now, sort: TIME_DESC) {
          episode
          airingAt
          media { ${MEDIA_FIELDS} }
        }
      }
    }`,
    { perPage: perPage * 2, now, weekAgo }
  )
  const seen = new Set<number>()
  const out: AnimeSummary[] = []
  for (const s of data.Page.airingSchedules) {
    const m = s.media
    if (!m || seen.has(m.id)) continue
    if (m.format && m.format !== 'TV') continue
    seen.add(m.id)
    const summary = mapSummary(m)
    summary.justAiredEpisode = s.episode
    out.push(summary)
    if (out.length >= perPage) break
  }
  return out
}

export async function alRelated(id: string): Promise<AnimeSummary[]> {
  const numericId = Number(id.replace(/^al-/, ''))
  const data = await gql<{ Media: { relations: { edges: { relationType: string; node: ALMedia }[] } } }>(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) {
        relations {
          edges {
            relationType
            node { ${MEDIA_FIELDS} }
          }
        }
      }
    }`,
    { id: numericId }
  )
  const seen = new Set<number>([numericId])
  const out: AnimeSummary[] = []
  const edges = data.Media.relations.edges ?? []
  const order = ['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'PARENT', 'ALTERNATIVE', 'SPIN_OFF']
  const sorted = [...edges].sort(
    (a, b) => order.indexOf(a.relationType) - order.indexOf(b.relationType)
  )
  for (const e of sorted) {
    const n = e.node
    if (!n || seen.has(n.id)) continue
    if (n.format && !['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'].includes(n.format)) continue
    seen.add(n.id)
    const s = mapSummary(n)
    s.relationType = e.relationType
    out.push(s)
  }
  return out
}

export async function alAnime(id: string): Promise<AnimeDetails> {
  const numericId = Number(id.replace(/^al-/, ''))
  const data = await gql<{ Media: ALMedia }>(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        description(asHtml: false)
        nextAiringEpisode { episode airingAt }
        airingSchedule(notYetAired: false, perPage: 200) { nodes { episode airingAt } }
      }
    }`,
    { id: numericId }
  )
  return mapDetails(data.Media)
}

export async function alEpisodes(id: string): Promise<Episode[]> {
  const numericId = Number(id.replace(/^al-/, ''))
  const data = await gql<{ Media: ALMedia }>(
    `query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        episodes
        bannerImage
        coverImage { extraLarge }
        nextAiringEpisode { episode }
        airingSchedule(notYetAired: false, perPage: 200) { nodes { episode airingAt } }
      }
    }`,
    { id: numericId }
  )
  return mapEpisodes(data.Media)
}

/**
 * Resolve a nice display title for stream lookups on your backend.
 * Returns { search, episode } for querying your own source.
 */
export function episodeLookupKey(animeTitle: string, episodeNumber: number) {
  return { search: animeTitle, episode: episodeNumber }
}
