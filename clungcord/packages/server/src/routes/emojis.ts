import db from "../db.ts";
import type { CustomEmoji } from "@clungcord/shared";
import path from "node:path";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

const EMOJI_DIR = path.join(import.meta.dir, "../../../../data/emojis");
mkdirSync(EMOJI_DIR, { recursive: true });

interface EmojiRow {
  id: number;
  name: string;
  url: string;
  uploaded_by: number;
  created_at: number;
  use_count: number;
}

function rowToEmoji(row: EmojiRow): CustomEmoji {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
  };
}

export function listEmojis(): CustomEmoji[] {
  const rows = db.query("SELECT * FROM custom_emojis ORDER BY use_count DESC, name").all() as EmojiRow[];
  return rows.map(rowToEmoji);
}

export function getEmojiDir(): string {
  return EMOJI_DIR;
}

export function incrementEmojiUseCount(emojiName: string): void {
  // emoji name comes as ":name:" — strip the colons
  const name = emojiName.replace(/^:|:$/g, "");
  db.query("UPDATE custom_emojis SET use_count = use_count + 1 WHERE name = ?").run(name);
}

export async function createEmoji(name: string, url: string, uploadedBy: number): Promise<CustomEmoji | null> {
  // Validate name: alphanumeric + underscores, 2-32 chars
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) return null;

  // If the URL is external, fetch the image and store it locally
  let finalUrl = url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Clungcord/1.0",
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        throw new Error(`URL does not point to an image (got ${contentType})`);
      }
      const buffer = await response.arrayBuffer();
      // Determine extension from content type
      const extMap: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
      };
      const ext = extMap[contentType.split(";")[0].trim()] ?? ".png";
      const filename = `${name}${ext}`;
      const filePath = path.join(EMOJI_DIR, filename);
      writeFileSync(filePath, Buffer.from(buffer));
      finalUrl = `/api/emojis/img/${filename}`;
    } catch (e: any) {
      throw new Error(`Failed to download emoji image: ${e.message}`);
    }
  }

  try {
    const result = db.query(
      "INSERT INTO custom_emojis (name, url, uploaded_by) VALUES (?, ?, ?)"
    ).run(name, finalUrl, uploadedBy);
    const row = db.query("SELECT * FROM custom_emojis WHERE id = ?").get(result.lastInsertRowid) as EmojiRow;
    return rowToEmoji(row);
  } catch (e) {
    // unique constraint on name
    return null;
  }
}

export function deleteEmoji(id: number, userId: number): boolean {
  const existing = db.query("SELECT * FROM custom_emojis WHERE id = ?").get(id) as EmojiRow | undefined;
  if (!existing) return false;
  // Only the uploader can delete (or we could allow any user — keeping it simple)
  if (existing.uploaded_by !== userId) return false;
  db.query("DELETE FROM custom_emojis WHERE id = ?").run(id);
  return true;
}

// --- emoji.gg proxy ---

interface EmojiGGEntry {
  id: number;
  title: string;
  slug: string;
  image: string;
  description: string;
  category: number;
  faves: number;
}

let emojiGGCache: EmojiGGEntry[] = [];
let emojiGGCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function fetchEmojiGGCatalog(): Promise<EmojiGGEntry[]> {
  const now = Date.now();
  if (emojiGGCache.length > 0 && now - emojiGGCacheTime < CACHE_TTL_MS) {
    return emojiGGCache;
  }

  const res = await fetch("https://emoji.gg/api/", {
    headers: { "User-Agent": "Clungcord/1.0" },
  });
  if (!res.ok) {
    throw new Error(`emoji.gg API returned ${res.status}`);
  }
  const data = (await res.json()) as EmojiGGEntry[];
  emojiGGCache = data;
  emojiGGCacheTime = now;
  return data;
}

export interface EmojiGGResult {
  title: string;
  slug: string;
  image: string;
  faves: number;
}

function toResult(e: EmojiGGEntry): EmojiGGResult {
  return { title: e.title, slug: e.slug, image: e.image, faves: e.faves };
}

export async function getEmojiGGTrending(): Promise<EmojiGGResult[]> {
  const catalog = await fetchEmojiGGCatalog();
  // Sort by faves descending, take top 20
  const sorted = [...catalog].sort((a, b) => b.faves - a.faves);
  return sorted.slice(0, 20).map(toResult);
}

export async function searchEmojiGG(query: string): Promise<EmojiGGResult[]> {
  const catalog = await fetchEmojiGGCatalog();
  const q = query.toLowerCase();
  const matches = catalog.filter((e) => e.title.toLowerCase().includes(q));
  // Sort matches by faves descending, limit to 40
  matches.sort((a, b) => b.faves - a.faves);
  return matches.slice(0, 40).map(toResult);
}
