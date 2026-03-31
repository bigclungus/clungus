// Shared utility functions for the Clungiverse client

/**
 * Convert a mob display_name to a JS-safe slug matching the sprite function name.
 * "Cave Rat" -> "cave_rat", "Centronias the Void Walker" -> "centronias_the_void_walker"
 */
export function mobSlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
