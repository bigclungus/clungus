import { createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import { resolveEmojiUrl } from "../api.ts";
import type { CustomEmoji } from "@clungcord/shared";

// Unicode emoji name map for autocomplete (common ones)
const UNICODE_EMOJI_MAP: Record<string, string> = {
  grinning: "\u{1F600}", smile: "\u{1F604}", laugh: "\u{1F606}", sweat_smile: "\u{1F605}",
  joy: "\u{1F602}", rofl: "\u{1F923}", blush: "\u{1F60A}", innocent: "\u{1F607}",
  wink: "\u{1F609}", relieved: "\u{1F60C}", heart_eyes: "\u{1F60D}", kissing_heart: "\u{1F618}",
  yum: "\u{1F60B}", stuck_out_tongue_winking_eye: "\u{1F61C}", zany: "\u{1F92A}",
  thinking: "\u{1F914}", shushing: "\u{1F92B}", zipper_mouth: "\u{1F910}",
  raised_eyebrow: "\u{1F928}", neutral: "\u{1F610}", expressionless: "\u{1F611}",
  smirk: "\u{1F60F}", unamused: "\u{1F612}", rolling_eyes: "\u{1F644}",
  grimacing: "\u{1F62C}", sleeping: "\u{1F634}", mask: "\u{1F637}",
  nauseated: "\u{1F922}", vomiting: "\u{1F92E}", hot: "\u{1F975}", cold: "\u{1F976}",
  exploding_head: "\u{1F92F}", cowboy: "\u{1F920}", partying: "\u{1F973}",
  sunglasses: "\u{1F60E}", nerd: "\u{1F913}", confused: "\u{1F615}",
  worried: "\u{1F61F}", frowning: "\u{1F641}", open_mouth: "\u{1F62E}",
  hushed: "\u{1F62F}", astonished: "\u{1F632}", flushed: "\u{1F633}",
  pleading: "\u{1F97A}", cry: "\u{1F622}", sob: "\u{1F62D}", scream: "\u{1F631}",
  angry: "\u{1F620}", rage: "\u{1F621}", cursing: "\u{1F92C}",
  skull: "\u{1F480}", poop: "\u{1F4A9}", clown: "\u{1F921}", ghost: "\u{1F47B}",
  alien: "\u{1F47D}", robot: "\u{1F916}",
  thumbsup: "\u{1F44D}", thumbs_up: "\u{1F44D}", "+1": "\u{1F44D}",
  thumbsdown: "\u{1F44E}", thumbs_down: "\u{1F44E}", "-1": "\u{1F44E}",
  clap: "\u{1F44F}", wave: "\u{1F44B}", ok_hand: "\u{1F44C}",
  muscle: "\u{1F4AA}", pray: "\u{1F64F}", middle_finger: "\u{1F595}",
  heart: "\u{2764}\u{FE0F}", orange_heart: "\u{1F9E1}", yellow_heart: "\u{1F49B}",
  green_heart: "\u{1F49A}", blue_heart: "\u{1F499}", purple_heart: "\u{1F49C}",
  black_heart: "\u{1F5A4}", broken_heart: "\u{1F494}",
  fire: "\u{1F525}", star: "\u{2B50}", sparkles: "\u{2728}", boom: "\u{1F4A5}",
  100: "\u{1F4AF}", check: "\u{2705}", x: "\u{274C}", warning: "\u{26A0}\u{FE0F}",
  eyes: "\u{1F440}", brain: "\u{1F9E0}", crown: "\u{1F451}",
  rocket: "\u{1F680}", rainbow: "\u{1F308}", tada: "\u{1F389}",
  party_popper: "\u{1F389}", confetti_ball: "\u{1F38A}",
  trophy: "\u{1F3C6}", medal: "\u{1F3C5}",
  dog: "\u{1F436}", cat: "\u{1F431}", frog: "\u{1F438}", monkey: "\u{1F435}",
  penguin: "\u{1F427}", chicken: "\u{1F414}", snake: "\u{1F40D}",
  beer: "\u{1F37A}", beers: "\u{1F37B}", coffee: "\u{2615}",
  pizza: "\u{1F355}", burger: "\u{1F354}", fries: "\u{1F35F}",
  computer: "\u{1F4BB}", phone: "\u{1F4F1}",
  rock: "\u{1FAA8}", stone: "\u{1FAA8}",
  pensive: "\u{1F614}", disappointed: "\u{1F61E}",
  weary: "\u{1F629}", tired: "\u{1F62B}",
  sus: "\u{1F928}", cap: "\u{1F9E2}", no_cap: "\u{1F9E2}",
  salute: "\u{1FAE1}", monocle: "\u{1F9D0}",
  handshake: "\u{1F91D}", point_up: "\u{261D}\u{FE0F}",
  point_right: "\u{1F449}", point_left: "\u{1F448}",
  peace: "\u{270C}\u{FE0F}", crossed_fingers: "\u{1F91E}",
  metal: "\u{1F918}", call_me: "\u{1F919}",
  raised_hand: "\u{270B}", vulcan: "\u{1F596}",
  pinching: "\u{1F90F}", pinched_fingers: "\u{1F90C}",
};

interface AutocompleteItem {
  name: string;
  type: "custom" | "unicode";
  url?: string;        // for custom emoji
  unicode?: string;    // for unicode emoji
}

interface RichInputProps {
  placeholder: string;
  customEmojis: CustomEmoji[];
  onSend: (text: string) => void;
  onTyping: () => void;
  ref?: (el: HTMLDivElement) => void;
}

export default function RichInput(props: RichInputProps) {
  let editorRef: HTMLDivElement | undefined;
  let autocompleteRef: HTMLDivElement | undefined;
  const [autocompleteItems, setAutocompleteItems] = createSignal<AutocompleteItem[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = createSignal(0);
  const [showAutocomplete, setShowAutocomplete] = createSignal(false);
  const [autocompletePos, setAutocompletePos] = createSignal({ left: 0, bottom: 0 });
  let lastTypingSent = 0;

  onMount(() => {
    if (props.ref && editorRef) {
      props.ref(editorRef);
    }
  });

  // Get the current emoji trigger text (the `:` prefix query) from cursor position
  function getEmojiQuery(): { query: string; range: Range } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent ?? "";
    const offset = range.startOffset;

    // Walk backwards from cursor to find `:` trigger
    let colonIdx = -1;
    for (let i = offset - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === ":") {
        // Make sure colon is at start of text or preceded by whitespace
        if (i === 0 || /\s/.test(text[i - 1])) {
          colonIdx = i;
        }
        break;
      }
      // Only allow valid emoji name chars
      if (!/[a-zA-Z0-9_+\-]/.test(ch)) break;
    }

    if (colonIdx < 0) return null;
    const query = text.slice(colonIdx + 1, offset);
    if (query.length < 1) return null;

    // Build range covering the `:query` part
    const triggerRange = document.createRange();
    triggerRange.setStart(node, colonIdx);
    triggerRange.setEnd(node, offset);

    return { query, range: triggerRange };
  }

  function updateAutocomplete() {
    const result = getEmojiQuery();
    if (!result) {
      setShowAutocomplete(false);
      return;
    }

    const { query } = result;
    const q = query.toLowerCase();

    const items: AutocompleteItem[] = [];

    // Search custom emojis first
    for (const emoji of props.customEmojis) {
      if (emoji.name.toLowerCase().includes(q)) {
        items.push({ name: emoji.name, type: "custom", url: resolveEmojiUrl(emoji.url) });
      }
      if (items.length >= 10) break;
    }

    // Then unicode
    if (items.length < 10) {
      for (const [name, unicode] of Object.entries(UNICODE_EMOJI_MAP)) {
        if (name.toLowerCase().includes(q) && !items.some(i => i.name === name)) {
          items.push({ name, type: "unicode", unicode });
          if (items.length >= 10) break;
        }
      }
    }

    if (items.length === 0) {
      setShowAutocomplete(false);
      return;
    }

    setAutocompleteItems(items);
    setAutocompleteIndex(0);
    setShowAutocomplete(true);

    // Position the dropdown above the cursor
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const editorRect = editorRef!.getBoundingClientRect();
      setAutocompletePos({
        left: Math.max(0, rect.left - editorRect.left),
        bottom: editorRect.bottom - rect.top + 4,
      });
    }
  }

  function placeCursorAfter(node: Node) {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function insertEmoji(item: AutocompleteItem) {
    const result = getEmojiQuery();
    if (!result) return;

    const { range } = result;
    range.deleteContents();

    if (item.type === "custom" && item.url) {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = `:${item.name}:`;
      img.title = `:${item.name}:`;
      img.className = "ce-inline-emoji";
      img.draggable = false;
      img.contentEditable = "false";
      img.dataset.emojiName = item.name;
      range.insertNode(img);
      placeCursorAfter(img);
    } else if (item.type === "unicode" && item.unicode) {
      const textNode = document.createTextNode(item.unicode);
      range.insertNode(textNode);
      placeCursorAfter(textNode);
    }

    setShowAutocomplete(false);
    editorRef?.focus();
  }

  // Extract wire-format text from the contenteditable div
  function extractText(): string {
    if (!editorRef) return "";
    const parts: string[] = [];

    function walk(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent ?? "");
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.tagName === "IMG" && el.dataset.emojiName) {
          parts.push(`:${el.dataset.emojiName}:`);
        } else if (el.tagName === "BR") {
          parts.push("\n");
        } else if (el.tagName === "DIV" || el.tagName === "P") {
          // Block elements get newlines (except first child)
          if (parts.length > 0 && parts[parts.length - 1] !== "\n") {
            parts.push("\n");
          }
          for (const child of el.childNodes) {
            walk(child);
          }
          return;
        } else {
          for (const child of el.childNodes) {
            walk(child);
          }
          return;
        }
      }
    }

    for (const child of editorRef.childNodes) {
      walk(child);
    }

    return parts.join("");
  }

  function isEmpty(): boolean {
    if (!editorRef) return true;
    // Check if there's any meaningful content
    if (editorRef.querySelector("img")) return false;
    const text = editorRef.textContent ?? "";
    return text.trim().length === 0;
  }

  function clear() {
    if (editorRef) {
      editorRef.innerHTML = "";
    }
  }

  function handleInput() {
    updateAutocomplete();
    // Auto-resize: the div handles this naturally via min/max-height
    // Send typing indicator (throttled)
    if (Date.now() - lastTypingSent > 3000) {
      lastTypingSent = Date.now();
      props.onTyping();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (showAutocomplete()) {
      const items = autocompleteItems();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutocompleteIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutocompleteIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertEmoji(items[autocompleteIndex()]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowAutocomplete(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = extractText().trim();
      if (!text) return;
      props.onSend(text);
      clear();
      return;
    }

    if (e.key === "Escape") {
      // Propagate escape for reply-bar clearing etc
      return;
    }
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    // Insert as plain text only
    document.execCommand("insertText", false, text);
  }

  // Expose focus method and clear
  function focus() {
    editorRef?.focus();
  }

  // Store methods on the element for parent access
  onMount(() => {
    if (editorRef) {
      (editorRef as any).__richInput = { focus, clear, extractText, isEmpty };
    }
  });

  return (
    <div class="rich-input-container" style={{ position: "relative", flex: "1" }}>
      <Show when={showAutocomplete()}>
        <div
          ref={autocompleteRef}
          class="emoji-autocomplete"
          style={{
            left: autocompletePos().left + "px",
            bottom: autocompletePos().bottom + "px",
          }}
        >
          <For each={autocompleteItems()}>
            {(item, idx) => (
              <button
                class={`emoji-ac-item ${idx() === autocompleteIndex() ? "active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur
                  insertEmoji(item);
                }}
                onMouseEnter={() => setAutocompleteIndex(idx())}
              >
                <Show when={item.type === "custom" && item.url} fallback={
                  <span class="emoji-ac-preview">{item.unicode}</span>
                }>
                  <img src={item.url} alt={item.name} class="emoji-ac-preview-img" />
                </Show>
                <span class="emoji-ac-name">:{item.name}:</span>
              </button>
            )}
          </For>
        </div>
      </Show>
      <div
        ref={editorRef}
        class="rich-input"
        contentEditable={true}
        data-placeholder={props.placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
    </div>
  );
}
