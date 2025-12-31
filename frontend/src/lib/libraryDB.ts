/**
 * IndexedDB Service for VibeStream Pro Library
 * Stores downloaded audio files and metadata locally
 */

export interface LibrarySong {
  id: string;
  title: string;
  artist: string;
  duration: number;
  durationStr: string;
  thumbnail: string | null;
  audioBlob: Blob;
  downloadedAt: number;
  url: string;
  mode: "standard" | "minus_one" | "bass_boost" | "nightcore";
  fileSize: number;
}

const DB_NAME = "vibestream_library";
const DB_VERSION = 1;
const STORE_NAME = "songs";

class LibraryDB {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error("Failed to open IndexedDB"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("downloadedAt", "downloadedAt", { unique: false });
          store.createIndex("title", "title", { unique: false });
          store.createIndex("artist", "artist", { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  async addSong(song: LibrarySong): Promise<void> {
    const db = await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(song);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to add song"));
    });
  }

  async getSong(id: string): Promise<LibrarySong | undefined> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to get song"));
    });
  }

  async getAllSongs(): Promise<LibrarySong[]> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const songs = request.result as LibrarySong[];
        // Sort by downloadedAt descending (newest first)
        songs.sort((a, b) => b.downloadedAt - a.downloadedAt);
        resolve(songs);
      };
      request.onerror = () => reject(new Error("Failed to get songs"));
    });
  }

  async deleteSong(id: string): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete song"));
    });
  }

  async clearLibrary(): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to clear library"));
    });
  }

  async getSongCount(): Promise<number> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Failed to count songs"));
    });
  }

  async getStorageUsed(): Promise<number> {
    const songs = await this.getAllSongs();
    return songs.reduce((total, song) => total + song.fileSize, 0);
  }
}

// Singleton instance
export const libraryDB = new LibraryDB();

// Helper to generate unique song ID
export function generateSongId(url: string, mode: string): string {
  const hash = url.split("").reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  return `${Math.abs(hash)}_${mode}_${Date.now()}`;
}

// Helper to format bytes
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
