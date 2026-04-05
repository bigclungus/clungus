import { createSignal, createResource, For, Show, onMount, onCleanup, createMemo } from "solid-js";
import * as api from "../api.ts";
import { resolveEmojiUrl } from "../api.ts";
import type { CustomEmoji } from "@clungcord/shared";
import type { EmojiGGResult } from "../api.ts";
import { IconSearch, IconX } from "./Icons.tsx";

// Common unicode emojis organized by category
const UNICODE_EMOJIS: Record<string, string[]> = {
  "Smileys": [
    "\u{1F600}", "\u{1F603}", "\u{1F604}", "\u{1F601}", "\u{1F606}", "\u{1F605}", "\u{1F602}", "\u{1F923}",
    "\u{1F60A}", "\u{1F607}", "\u{1F642}", "\u{1F643}", "\u{1F609}", "\u{1F60C}", "\u{1F60D}", "\u{1F970}",
    "\u{1F618}", "\u{1F617}", "\u{1F619}", "\u{1F61A}", "\u{1F60B}", "\u{1F61B}", "\u{1F61C}", "\u{1F92A}",
    "\u{1F61D}", "\u{1F911}", "\u{1F917}", "\u{1F92D}", "\u{1F92B}", "\u{1F914}", "\u{1F910}", "\u{1F928}",
    "\u{1F610}", "\u{1F611}", "\u{1F636}", "\u{1F60F}", "\u{1F612}", "\u{1F644}", "\u{1F62C}", "\u{1F925}",
    "\u{1F60C}", "\u{1F614}", "\u{1F62A}", "\u{1F924}", "\u{1F634}", "\u{1F637}", "\u{1F912}", "\u{1F915}",
    "\u{1F922}", "\u{1F92E}", "\u{1F927}", "\u{1F975}", "\u{1F976}", "\u{1F974}", "\u{1F635}", "\u{1F92F}",
    "\u{1F920}", "\u{1F973}", "\u{1F978}", "\u{1F60E}", "\u{1F913}", "\u{1F9D0}", "\u{1F615}", "\u{1F61F}",
    "\u{1F641}", "\u{2639}\u{FE0F}", "\u{1F62E}", "\u{1F62F}", "\u{1F632}", "\u{1F633}", "\u{1F97A}", "\u{1F979}",
    "\u{1F626}", "\u{1F627}", "\u{1F628}", "\u{1F630}", "\u{1F625}", "\u{1F622}", "\u{1F62D}", "\u{1F631}",
    "\u{1F616}", "\u{1F623}", "\u{1F61E}", "\u{1F613}", "\u{1F629}", "\u{1F62B}", "\u{1F971}", "\u{1F624}",
    "\u{1F621}", "\u{1F620}", "\u{1F92C}", "\u{1F608}", "\u{1F47F}", "\u{1F480}", "\u{2620}\u{FE0F}",
  ],
  "Gestures": [
    "\u{1F44D}", "\u{1F44E}", "\u{1F44A}", "\u{270A}", "\u{1F91B}", "\u{1F91C}", "\u{1F44F}", "\u{1F64C}",
    "\u{1F450}", "\u{1F932}", "\u{1F91D}", "\u{1F64F}", "\u{270D}\u{FE0F}", "\u{1F485}", "\u{1F933}",
    "\u{1F4AA}", "\u{1F9BE}", "\u{1F9BF}", "\u{1F448}", "\u{1F449}", "\u{261D}\u{FE0F}", "\u{1F446}",
    "\u{1F595}", "\u{1F447}", "\u{270C}\u{FE0F}", "\u{1F91E}", "\u{1F91F}", "\u{1F918}", "\u{1F919}",
    "\u{1F44B}", "\u{1F91A}", "\u{1F590}\u{FE0F}", "\u{270B}", "\u{1F596}", "\u{1F44C}", "\u{1F90C}",
    "\u{1F90F}", "\u{270C}\u{FE0F}", "\u{1FAF0}", "\u{1FAF1}", "\u{1FAF2}", "\u{1FAF3}", "\u{1FAF4}",
  ],
  "Hearts": [
    "\u{2764}\u{FE0F}", "\u{1F9E1}", "\u{1F49B}", "\u{1F49A}", "\u{1F499}", "\u{1F49C}", "\u{1F90E}",
    "\u{1F5A4}", "\u{1FA76}", "\u{1F90D}", "\u{1F498}", "\u{1F49D}", "\u{1F496}", "\u{1F497}",
    "\u{1F493}", "\u{1F49E}", "\u{1F495}", "\u{1F48C}", "\u{1F49F}", "\u{2763}\u{FE0F}", "\u{2764}\u{FE0F}\u{200D}\u{1F525}",
  ],
  "Animals": [
    "\u{1F436}", "\u{1F431}", "\u{1F42D}", "\u{1F439}", "\u{1F430}", "\u{1F98A}", "\u{1F43B}", "\u{1F43C}",
    "\u{1F428}", "\u{1F42F}", "\u{1F981}", "\u{1F42E}", "\u{1F437}", "\u{1F438}", "\u{1F435}", "\u{1F412}",
    "\u{1F414}", "\u{1F427}", "\u{1F426}", "\u{1F985}", "\u{1F989}", "\u{1F987}", "\u{1F40A}", "\u{1F422}",
    "\u{1F40D}", "\u{1F409}", "\u{1F995}", "\u{1F996}", "\u{1F433}", "\u{1F40B}", "\u{1F42C}", "\u{1F41F}",
    "\u{1F419}", "\u{1F41A}", "\u{1F40C}", "\u{1F98B}", "\u{1F41B}", "\u{1F41D}", "\u{1F41E}", "\u{1FAB2}",
  ],
  "Objects": [
    "\u{1F525}", "\u{2B50}", "\u{1F31F}", "\u{2728}", "\u{1F4A5}", "\u{1F4A2}", "\u{1F4A6}", "\u{1F4A8}",
    "\u{1F389}", "\u{1F38A}", "\u{1F388}", "\u{1F381}", "\u{1F3C6}", "\u{1F3C5}", "\u{1F947}", "\u{1F948}",
    "\u{1F949}", "\u{26BD}", "\u{1F3C0}", "\u{1F3C8}", "\u{1F3AF}", "\u{1F3AE}", "\u{1F3B2}", "\u{1F52E}",
    "\u{1F4BB}", "\u{1F4F1}", "\u{2328}\u{FE0F}", "\u{1F5A5}\u{FE0F}", "\u{1F4BE}", "\u{1F4BF}", "\u{1F4C0}",
    "\u{1F4A1}", "\u{1F50B}", "\u{1F50C}", "\u{1F527}", "\u{1F528}", "\u{1F6E0}\u{FE0F}", "\u{1F5E1}\u{FE0F}",
  ],
  "Food": [
    "\u{1F34E}", "\u{1F34A}", "\u{1F34B}", "\u{1F34C}", "\u{1F349}", "\u{1F347}", "\u{1F353}", "\u{1F348}",
    "\u{1F352}", "\u{1F351}", "\u{1F34D}", "\u{1F96D}", "\u{1F95D}", "\u{1F345}", "\u{1F346}", "\u{1F33D}",
    "\u{1F336}\u{FE0F}", "\u{1F952}", "\u{1F96C}", "\u{1F966}", "\u{1F9C5}", "\u{1F9C6}", "\u{1F35E}", "\u{1F950}",
    "\u{1F956}", "\u{1F968}", "\u{1F96F}", "\u{1F354}", "\u{1F355}", "\u{1F32D}", "\u{1F32E}", "\u{1F32F}",
    "\u{1F37F}", "\u{1F969}", "\u{1F357}", "\u{1F356}", "\u{1F9C7}", "\u{1F364}", "\u{1F363}", "\u{1F370}",
    "\u{1F382}", "\u{1F36E}", "\u{1F36D}", "\u{1F36C}", "\u{1F36B}", "\u{2615}", "\u{1F37A}", "\u{1F37B}",
  ],
};

const RECENTLY_USED_KEY = "clungcord_recent_emojis";
const MAX_RECENT = 24;

function getRecentEmojis(): string[] {
  try {
    const stored = localStorage.getItem(RECENTLY_USED_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentEmoji(emoji: string): void {
  const recent = getRecentEmojis().filter((e) => e !== emoji);
  recent.unshift(emoji);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(recent));
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: { x: number; y: number };
  onCustomEmojiAdded?: (emoji: CustomEmoji) => void;
}

export default function EmojiPicker(props: EmojiPickerProps) {
  const [search, setSearch] = createSignal("");
  const [tab, setTab] = createSignal<"standard" | "custom">("standard");
  const [customEmojis, { refetch: refetchCustom }] = createResource(api.getCustomEmojis);
  const [recentEmojis, setRecentEmojis] = createSignal(getRecentEmojis());
  let pickerRef: HTMLDivElement | undefined;

  function handleClickOutside(e: MouseEvent) {
    if (pickerRef && !pickerRef.contains(e.target as Node)) {
      props.onClose();
    }
  }

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
  });

  function handleSelect(emoji: string) {
    addRecentEmoji(emoji);
    setRecentEmojis(getRecentEmojis());
    props.onSelect(emoji);
  }

  const filteredUnicode = createMemo(() => {
    const q = search().toLowerCase();
    if (!q) return UNICODE_EMOJIS;
    const result: Record<string, string[]> = {};
    for (const [cat, emojis] of Object.entries(UNICODE_EMOJIS)) {
      // Simple filter: we can't search unicode emoji by name without a name map,
      // so just show all when no search, or filter custom emojis by name
      result[cat] = emojis;
    }
    return result;
  });

  const filteredCustom = createMemo(() => {
    const q = search().toLowerCase();
    const emojis = customEmojis() ?? [];
    if (!q) return emojis;
    return emojis.filter((e) => e.name.toLowerCase().includes(q));
  });

  return (
    <div class="emoji-picker" ref={pickerRef}>
      <div class="emoji-picker-header">
        <Show when={tab() === "standard"}>
          <div class="emoji-search-wrapper">
            <IconSearch size={14} />
            <input
              type="text"
              placeholder="Search emojis..."
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              autofocus
            />
          </div>
        </Show>
        <div class="emoji-tabs">
          <button
            class={tab() === "standard" ? "active" : ""}
            onClick={() => setTab("standard")}
          >Standard</button>
          <button
            class={tab() === "custom" ? "active" : ""}
            onClick={() => setTab("custom")}
          >Custom</button>
        </div>
      </div>

      <div class="emoji-picker-body">
        <Show when={tab() === "standard"}>
          <Show when={recentEmojis().length > 0}>
            <div class="emoji-category">
              <div class="emoji-category-label">Recent</div>
              <div class="emoji-grid">
                <For each={recentEmojis()}>
                  {(emoji) => (
                    <button
                      class="emoji-btn"
                      onClick={(e) => { e.stopPropagation(); handleSelect(emoji); }}
                      title={emoji}
                    >
                      <Show when={emoji.startsWith(":")} fallback={emoji}>
                        {(() => {
                          const name = emoji.slice(1, -1);
                          const custom = (customEmojis() ?? []).find((e) => e.name === name);
                          return custom ? (
                            <img
                              src={resolveEmojiUrl(custom.url)}
                              alt={custom.name}
                              class="custom-emoji-img"
                              draggable={false}
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.style.display = "none";
                                const fallback = document.createElement("span");
                                fallback.textContent = `:${name}:`;
                                fallback.className = "emoji-fallback-text";
                                target.parentElement?.appendChild(fallback);
                              }}
                            />
                          ) : emoji;
                        })()}
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <For each={Object.entries(filteredUnicode())}>
            {([category, emojis]) => (
              <div class="emoji-category">
                <div class="emoji-category-label">{category}</div>
                <div class="emoji-grid">
                  <For each={emojis}>
                    {(emoji) => (
                      <button
                        class="emoji-btn"
                        onClick={() => handleSelect(emoji)}
                        title={emoji}
                      >{emoji}</button>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </Show>

        <Show when={tab() === "custom"}>
          <CustomTab
            customEmojis={filteredCustom()}
            onSelect={handleSelect}
            onEmojiAdded={refetchCustom}
            onCustomEmojiAdded={props.onCustomEmojiAdded}
          />
        </Show>
      </div>
    </div>
  );
}

function CustomTab(props: {
  customEmojis: CustomEmoji[];
  onSelect: (emoji: string) => void;
  onEmojiAdded: () => void;
  onCustomEmojiAdded?: (emoji: CustomEmoji) => void;
}) {
  const [ggSearch, setGGSearch] = createSignal("");
  const [ggResults, setGGResults] = createSignal<EmojiGGResult[]>([]);
  const [ggLoading, setGGLoading] = createSignal(false);
  const [ggError, setGGError] = createSignal("");
  const [isSearchMode, setIsSearchMode] = createSignal(false);
  const [savingSlug, setSavingSlug] = createSignal<string | null>(null);
  const [trending] = createResource(api.getEmojiGGTrending);

  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function handleGGSearchInput(value: string) {
    setGGSearch(value);
    if (searchTimer) clearTimeout(searchTimer);

    if (!value.trim()) {
      setIsSearchMode(false);
      setGGResults([]);
      return;
    }

    setIsSearchMode(true);
    searchTimer = setTimeout(async () => {
      setGGLoading(true);
      setGGError("");
      try {
        const results = await api.searchEmojiGG(value.trim());
        setGGResults(results);
      } catch (e: any) {
        setGGError(e.message ?? "Search failed");
      } finally {
        setGGLoading(false);
      }
    }, 300);
  }

  async function handleSaveEmoji(emoji: EmojiGGResult) {
    setSavingSlug(emoji.slug);
    try {
      // Sanitize name: lowercase, replace spaces/hyphens with underscores, strip non-alphanumeric
      const name = emoji.title
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 32);
      if (name.length < 2) {
        throw new Error("Emoji name too short after sanitization");
      }
      const saved = await api.uploadCustomEmoji(name, emoji.image);
      props.onEmojiAdded();
      props.onCustomEmojiAdded?.(saved);
    } catch (e: any) {
      // If name taken, that's fine — it's already saved
      console.error("Failed to save emoji:", e.message);
    } finally {
      setSavingSlug(null);
    }
  }

  const ggDisplayList = createMemo(() => {
    if (isSearchMode()) return ggResults();
    return trending() ?? [];
  });

  return (
    <>
      {/* Your Emojis section */}
      <div class="emoji-category">
        <div class="emoji-category-label">Your Emojis</div>
        <Show when={props.customEmojis.length > 0} fallback={
          <div class="emoji-empty-hint">No custom emojis yet. Add one from emoji.gg below.</div>
        }>
          <div class="emoji-grid">
            <For each={props.customEmojis}>
              {(emoji) => (
                <button
                  class="emoji-btn custom"
                  onClick={(e) => { e.stopPropagation(); props.onSelect(`:${emoji.name}:`); }}
                  title={`:${emoji.name}:`}
                >
                  <img
                    src={resolveEmojiUrl(emoji.url)}
                    alt={emoji.name}
                    class="custom-emoji-img"
                    draggable={false}
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = "none";
                      const fallback = document.createElement("span");
                      fallback.textContent = `:${emoji.name}:`;
                      fallback.className = "emoji-fallback-text";
                      target.parentElement?.appendChild(fallback);
                    }}
                  />
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* emoji.gg section */}
      <div class="emoji-gg-section">
        <div class="emoji-category-label">
          {isSearchMode() ? "emoji.gg Search" : "Trending on emoji.gg"}
        </div>
        <div class="emoji-search-wrapper gg-search">
          <IconSearch size={14} />
          <input
            type="text"
            placeholder="Search emoji.gg..."
            value={ggSearch()}
            onInput={(e) => handleGGSearchInput(e.currentTarget.value)}
          />
          <Show when={ggSearch()}>
            <button class="gg-search-clear" onClick={() => handleGGSearchInput("")}>
              <IconX size={12} />
            </button>
          </Show>
        </div>

        <Show when={ggError()}>
          <div class="custom-emoji-error">{ggError()}</div>
        </Show>

        <Show when={ggLoading()}>
          <div class="emoji-empty-hint">Searching...</div>
        </Show>

        <Show when={!ggLoading()}>
          <Show when={ggDisplayList().length > 0} fallback={
            <Show when={isSearchMode()}>
              <div class="emoji-empty-hint">No results found.</div>
            </Show>
          }>
            <div class="emoji-gg-grid">
              <For each={ggDisplayList()}>
                {(emoji) => (
                  <button
                    class="emoji-gg-btn"
                    onClick={() => handleSaveEmoji(emoji)}
                    title={`${emoji.title} (click to save)`}
                    disabled={savingSlug() === emoji.slug}
                  >
                    <img
                      src={emoji.image}
                      alt={emoji.title}
                      class="emoji-gg-img"
                      loading="lazy"
                    />
                    <span class="emoji-gg-name">{emoji.title}</span>
                    <Show when={savingSlug() === emoji.slug}>
                      <span class="emoji-gg-saving">...</span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      {/* Manual upload fallback */}
      <CustomEmojiUpload onUploaded={props.onEmojiAdded} onCustomEmojiAdded={props.onCustomEmojiAdded} />
    </>
  );
}

function CustomEmojiUpload(props: { onUploaded: () => void; onCustomEmojiAdded?: (emoji: CustomEmoji) => void }) {
  const [name, setName] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [error, setError] = createSignal("");

  async function handleUpload() {
    setError("");
    const n = name().trim();
    const u = url().trim();
    if (!n || !u) {
      setError("Name and URL required");
      return;
    }
    try {
      const saved = await api.uploadCustomEmoji(n, u);
      setName("");
      setUrl("");
      props.onUploaded();
      props.onCustomEmojiAdded?.(saved);
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    }
  }

  return (
    <div class="custom-emoji-upload">
      <div class="custom-emoji-upload-label">Add Custom Emoji</div>
      <input
        type="text"
        placeholder="name (e.g. bufo_nerd)"
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <input
        type="text"
        placeholder="image URL"
        value={url()}
        onInput={(e) => setUrl(e.currentTarget.value)}
      />
      <button class="btn btn-primary btn-sm" onClick={handleUpload}>Upload</button>
      <Show when={error()}>
        <div class="custom-emoji-error">{error()}</div>
      </Show>
    </div>
  );
}
