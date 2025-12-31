/**
 * Supabase Client for VibeStream Pro
 * Used for social trending features
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Types for trending songs
export interface TrendingSong {
  id: string;
  title: string;
  artist: string | null;
  thumbnail: string | null;
  url: string;
  download_count: number;
  last_downloaded: string;
  created_at: string;
}

/**
 * Record a download to update trending stats
 */
export async function recordDownload(song: {
  title: string;
  artist?: string | null;
  thumbnail?: string | null;
  url: string;
}): Promise<void> {
  if (!supabase) {
    console.warn("Supabase not configured - trending disabled");
    return;
  }

  try {
    // Try to upsert - increment download_count if exists, otherwise insert
    const { error } = await supabase.rpc("increment_download", {
      song_url: song.url,
      song_title: song.title,
      song_artist: song.artist || null,
      song_thumbnail: song.thumbnail || null,
    });

    if (error) {
      // Fallback: Just insert/update directly
      await supabase
        .from("trending_songs")
        .upsert(
          {
            url: song.url,
            title: song.title,
            artist: song.artist,
            thumbnail: song.thumbnail,
            download_count: 1,
            last_downloaded: new Date().toISOString(),
          },
          { onConflict: "url" }
        );
    }
  } catch (err) {
    console.error("Failed to record download for trending:", err);
  }
}

/**
 * Get top trending songs
 */
export async function getTrendingSongs(limit: number = 3): Promise<TrendingSong[]> {
  if (!supabase) {
    // Return mock data if Supabase not configured
    return [
      {
        id: "1",
        title: "Blinding Lights",
        artist: "The Weeknd",
        thumbnail: "https://i.ytimg.com/vi/4NRXx6U8ABQ/maxresdefault.jpg",
        url: "https://youtube.com/watch?v=4NRXx6U8ABQ",
        download_count: 1234,
        last_downloaded: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: "2",
        title: "Levitating",
        artist: "Dua Lipa",
        thumbnail: "https://i.ytimg.com/vi/TUVcZfQe-Kw/maxresdefault.jpg",
        url: "https://youtube.com/watch?v=TUVcZfQe-Kw",
        download_count: 987,
        last_downloaded: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: "3",
        title: "Flowers",
        artist: "Miley Cyrus",
        thumbnail: "https://i.ytimg.com/vi/G7KNmW9a75Y/maxresdefault.jpg",
        url: "https://youtube.com/watch?v=G7KNmW9a75Y",
        download_count: 856,
        last_downloaded: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ];
  }

  try {
    const { data, error } = await supabase
      .from("trending_songs")
      .select("*")
      .order("download_count", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Failed to fetch trending songs:", err);
    return [];
  }
}
