/**
 * GIF service using the Giphy API.
 * Set VITE_GIPHY_API_KEY in your .env to enable search and auto-assignment.
 * Get a free key at: https://developers.giphy.com/
 *
 * Without the key: URL-paste mode still works; search returns empty results.
 */

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

export interface GifResult {
  id: string;
  url: string;       // Direct GIF URL for display (gif_url from Giphy)
  preview: string;   // Smaller MP4 preview for thumbnail
  title: string;
  width: number;
  height: number;
}

function parseGiphyResult(item: any): GifResult {
  const original = item.images?.original;
  const preview = item.images?.preview_gif ?? item.images?.fixed_height_small;
  return {
    id: item.id,
    url: original?.url ?? '',
    preview: preview?.url ?? original?.url ?? '',
    title: item.title ?? '',
    width: parseInt(original?.width ?? '480', 10),
    height: parseInt(original?.height ?? '270', 10),
  };
}

/** Search Giphy for GIFs matching a query. Returns empty array if API key is missing. */
export async function searchGifs(query: string, limit = 12): Promise<GifResult[]> {
  if (!GIPHY_API_KEY || !query.trim()) return [];
  try {
    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      q: query.trim(),
      limit: String(limit),
      rating: 'pg',
      lang: 'en',
    });
    const res = await fetch(`${GIPHY_BASE}/search?${params}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []).map(parseGiphyResult).filter((g: GifResult) => g.url);
  } catch {
    return [];
  }
}

/** Fetch trending GIFs. Returns empty array if API key is missing. */
export async function getTrendingGifs(limit = 12): Promise<GifResult[]> {
  if (!GIPHY_API_KEY) return [];
  try {
    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      limit: String(limit),
      rating: 'pg',
    });
    const res = await fetch(`${GIPHY_BASE}/trending?${params}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []).map(parseGiphyResult).filter((g: GifResult) => g.url);
  } catch {
    return [];
  }
}

/**
 * Auto-assign a GIF URL for an archive based on a keyword.
 * Returns null if the API key is not configured or the request fails.
 * The caller should cache the result in the space's gif_background field.
 */
export async function autoAssignGif(keyword: string): Promise<string | null> {
  if (!GIPHY_API_KEY || !keyword.trim()) return null;
  try {
    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      tag: keyword.trim(),
      rating: 'pg',
    });
    const res = await fetch(`${GIPHY_BASE}/random?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.images?.original?.url ?? null;
  } catch {
    return null;
  }
}

/** Whether the GIF service is configured (API key present). */
export const gifServiceEnabled = !!GIPHY_API_KEY;
