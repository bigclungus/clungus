/**
 * Simple markdown-to-HTML renderer for chat messages.
 * Supports: bold, italic, strikethrough, inline code, code blocks, links, and line breaks.
 * Also supports custom emojis :name: if customEmojis list is provided.
 */

import { resolveEmojiUrl } from "./api.ts";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(raw: string, customEmojis: any[] = []): string {
  // Extract code blocks first to protect them from other transformations
  const codeBlocks: string[] = [];
  let text = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return `\x00CB${idx}\x00`;
  });

  // Extract custom emojis to protect their HTML from escaping
  const customEmojiHtmls: string[] = [];
  const customMap = new Map(customEmojis.map((e: any) => [e.name, e]));
  text = text.replace(/:([a-zA-Z0-9_]{2,32}):/g, (match, name) => {
    const emoji = customMap.get(name);
    if (emoji) {
      const idx = customEmojiHtmls.length;
      const escapedUrl = escapeHtml(resolveEmojiUrl(emoji.url));
      const escapedName = escapeHtml(name);
      const html = `<img src="${escapedUrl}" alt=":${escapedName}:" title=":${escapedName}:" class="custom-emoji-img" />`;
      customEmojiHtmls.push(html);
      return `\x00CE${idx}\x00`;
    }
    return match;
  });

  // Extract inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00IC${idx}\x00`;
  });

  // Escape HTML in remaining text
  text = escapeHtml(text);

  // Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_ (but not inside words for underscore)
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Links: [text](url)
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Auto-link bare URLs
  text = text.replace(
    /(?<!")(?<!=)(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Restore inline codes
  text = text.replace(/\x00IC(\d+)\x00/g, (_match, idx) => inlineCodes[Number(idx)]);

  // Restore code blocks
  text = text.replace(/\x00CB(\d+)\x00/g, (_match, idx) => codeBlocks[Number(idx)]);

  // Restore custom emojis
  text = text.replace(/\x00CE(\d+)\x00/g, (_match, idx) => customEmojiHtmls[Number(idx)]);

  // Line breaks (preserve newlines as <br> outside of code blocks)
  // Split on code blocks, only convert \n to <br> outside them
  const parts = text.split(/(<pre><code>[\s\S]*?<\/code><\/pre>)/g);
  text = parts
    .map((part) => {
      if (part.startsWith("<pre><code>")) return part;
      return part.replace(/\n/g, "<br>");
    })
    .join("");

  return text;
}
