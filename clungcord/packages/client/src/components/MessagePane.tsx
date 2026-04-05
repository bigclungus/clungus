import { For, Show, createSignal, createEffect, onMount, onCleanup, createMemo } from "solid-js";
import store from "../stores/app.ts";
import * as api from "../api.ts";
import { resolveEmojiUrl } from "../api.ts";
import type { Message, Reaction, CustomEmoji } from "@clungcord/shared";
import { IconMenu, IconHash, IconEdit, IconTrash, IconReply, IconPin, IconCopy, IconMoreHorizontal, IconX } from "./Icons.tsx";
import { renderMarkdown } from "../markdown.ts";
import EmojiPicker from "./EmojiPicker.tsx";
import RichInput from "./RichInput.tsx";

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

interface MessagePaneProps {
  onMenuClick: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  message: Message;
}

export default function MessagePane(props: MessagePaneProps) {
  const { state, sendTyping } = store;
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [editText, setEditText] = createSignal("");
  const [replyTo, setReplyTo] = createSignal<Message | null>(null);
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal<number | null>(null);
  const [showPins, setShowPins] = createSignal(false);
  const [pinnedMessages, setPinnedMessages] = createSignal<Message[]>([]);
  const [emojiPickerMsgId, setEmojiPickerMsgId] = createSignal<number | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = createSignal(false);
  const [customEmojis, setCustomEmojis] = createSignal<CustomEmoji[]>([]);

  // Load custom emojis once
  onMount(async () => {
    try {
      const emojis = await api.getCustomEmojis();
      setCustomEmojis(emojis);
    } catch {}
  });

  function handleCustomEmojiAdded(emoji: CustomEmoji) {
    setCustomEmojis((prev) => {
      if (prev.some((e) => e.id === emoji.id)) return prev;
      return [...prev, emoji];
    });
  }

  let messagesEndRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let inputRef: HTMLDivElement | undefined;

  const channel = () => state.channels.find((c) => c.id === state.activeChannelId);
  const messages = () => state.messages[state.activeChannelId ?? 0] ?? [];
  const typingUsers = createMemo(() => {
    const channelId = state.activeChannelId;
    if (!channelId) return [];
    return state.typing[channelId] ?? [];
  });

  // Auto-scroll to bottom on new messages
  let shouldAutoScroll = true;
  const [hasNewBelow, setHasNewBelow] = createSignal(false);

  function checkAutoScroll() {
    if (!containerRef) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef;
    shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
    if (shouldAutoScroll) setHasNewBelow(false);
  }

  function scrollToBottom() {
    messagesEndRef?.scrollIntoView({ behavior: "smooth" });
    shouldAutoScroll = true;
    setHasNewBelow(false);
  }

  createEffect(() => {
    const _msgs = messages();
    if (shouldAutoScroll && messagesEndRef) {
      requestAnimationFrame(() => {
        messagesEndRef?.scrollIntoView({ behavior: "smooth" });
      });
    } else if (_msgs.length > 0) {
      setHasNewBelow(true);
    }
  });

  // Scroll to bottom when switching channels; clear reply/context/input
  createEffect(() => {
    const _channelId = state.activeChannelId;
    shouldAutoScroll = true;
    setReplyTo(null);
    setEditingId(null);
    setContextMenu(null);
    setShowPins(false);
    // Clear the contenteditable input
    if (inputRef) {
      const ri = (inputRef as any).__richInput;
      if (ri) ri.clear();
    }
    requestAnimationFrame(() => {
      messagesEndRef?.scrollIntoView();
    });
  });

  // Close context menu on click outside
  // We track when the menu was last opened so the global click handler
  // (which fires in the same event cycle due to SolidJS event delegation)
  // doesn't immediately close a menu that was just opened.
  let menuOpenedAt = 0;
  function handleGlobalClick() {
    if (Date.now() - menuOpenedAt < 50) return;
    setContextMenu(null);
  }
  onMount(() => document.addEventListener("click", handleGlobalClick));
  onCleanup(() => document.removeEventListener("click", handleGlobalClick));

  // Close overlays on Escape
  function handleGlobalKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (contextMenu()) { setContextMenu(null); return; }
      if (showDeleteConfirm()) { setShowDeleteConfirm(null); return; }
      if (showPins()) { setShowPins(false); return; }
      if (replyTo()) { setReplyTo(null); return; }
    }
  }
  onMount(() => document.addEventListener("keydown", handleGlobalKeyDown));
  onCleanup(() => document.removeEventListener("keydown", handleGlobalKeyDown));

  async function handleSend(content: string) {
    if (!content || !state.activeChannelId) return;
    const reply = replyTo();
    setReplyTo(null);
    await api.sendMessage(state.activeChannelId, content, reply?.id);
  }

  function handleInputTyping() {
    if (state.activeChannelId) {
      sendTyping(state.activeChannelId);
    }
  }

  function startEdit(msg: Message) {
    setEditingId(msg.id);
    setEditText(msg.content);
    setContextMenu(null);
  }

  async function submitEdit() {
    const id = editingId();
    const content = editText().trim();
    if (!id || !content) return;
    await api.editMessage(id, content);
    setEditingId(null);
  }

  function handleEditKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitEdit();
    }
    if (e.key === "Escape") {
      setEditingId(null);
    }
  }

  async function handleDelete(msgId: number) {
    await api.deleteMessage(msgId);
    setShowDeleteConfirm(null);
    setContextMenu(null);
  }

  async function toggleReaction(messageId: number, emoji: string) {
    const msgs = messages();
    const msg = msgs.find((m) => m.id === messageId);
    if (!msg) return;
    const userId = state.user?.id;
    if (!userId) return;

    const existing = (msg.reactions ?? []).find((r) => r.emoji === emoji);
    if (existing && existing.users.includes(userId)) {
      await api.removeReaction(messageId, emoji);
    } else {
      await api.addReaction(messageId, emoji);
    }
  }

  function handleEmojiSelect(emoji: string) {
    const msgId = emojiPickerMsgId();
    if (msgId) {
      toggleReaction(msgId, emoji);
      setEmojiPickerMsgId(null);
    }
  }

  function handleInputEmojiSelect(emoji: string) {
    setShowInputEmojiPicker(false);
    if (!inputRef) return;
    // Focus and insert at end
    inputRef.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(inputRef);
      sel.collapseToEnd();
    }
    // Check if it's a custom emoji (starts with :)
    if (emoji.startsWith(":") && emoji.endsWith(":")) {
      const name = emoji.slice(1, -1);
      const found = customEmojis().find((e) => e.name === name);
      if (found) {
        const img = document.createElement("img");
        img.src = resolveEmojiUrl(found.url);
        img.alt = `:${name}:`;
        img.title = `:${name}:`;
        img.className = "ce-inline-emoji";
        img.draggable = false;
        img.contentEditable = "false";
        img.dataset.emojiName = name;
        document.execCommand("insertHTML", false, img.outerHTML);
      } else {
        document.execCommand("insertText", false, emoji);
      }
    } else {
      document.execCommand("insertText", false, emoji);
    }
  }

  function resolveCustomEmoji(emoji: string): { isCustom: boolean; name?: string; url?: string; text: string } {
    if (emoji.startsWith(":") && emoji.endsWith(":")) {
      const name = emoji.slice(1, -1);
      const found = customEmojis().find((e) => e.name === name);
      if (found) return { isCustom: true, name: found.name, url: resolveEmojiUrl(found.url), text: emoji };
    }
    return { isCustom: false, text: emoji };
  }

  function handleContextMenu(e: MouseEvent, msg: Message) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    menuOpenedAt = Date.now();
    setContextMenu({ x, y, message: msg });
  }

  function handleMessageClick(e: MouseEvent, msg: Message) {
    // Don't open context menu if user is selecting text
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    // Don't interfere with clicks on buttons, links, or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest("button, a, .reaction-chip, .message-actions, .edit-input")) return;
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 300);
    menuOpenedAt = Date.now();
    setContextMenu({ x, y, message: msg });
  }

  function handleMoreClick(e: MouseEvent, msg: Message) {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const x = Math.min(rect.right, window.innerWidth - 200);
    const y = Math.min(rect.bottom, window.innerHeight - 300);
    menuOpenedAt = Date.now();
    setContextMenu({ x, y, message: msg });
  }

  function startReply(msg: Message) {
    setReplyTo(msg);
    setContextMenu(null);
    inputRef?.focus();
  }

  async function copyMessage(msg: Message) {
    await navigator.clipboard.writeText(msg.content);
    setContextMenu(null);
  }

  async function togglePin(msg: Message) {
    setContextMenu(null);
    if (msg.pinned) {
      await api.unpinMessage(msg.id);
    } else {
      await api.pinMessage(msg.id);
    }
  }

  async function loadPinnedMessages() {
    const channelId = state.activeChannelId;
    if (!channelId) return;
    const pins = await api.getPinnedMessages(channelId);
    setPinnedMessages(pins);
    setShowPins(true);
  }

  function isCompact(msg: Message, idx: number): boolean {
    const msgs = messages();
    if (idx === 0) return false;
    const prev = msgs[idx - 1];
    if (prev.author_id !== msg.author_id) return false;
    if (msg.created_at - prev.created_at > 300) return false;
    if (msg.reply_to_id) return false;
    return true;
  }

  function channelDisplayName(): string {
    const ch = channel();
    if (!ch) return "";
    if (ch.type === "dm") {
      const names = ch.name.split(",");
      return names.find((n) => n !== state.user?.username) ?? ch.name;
    }
    return ch.name;
  }

  return (
    <div class="main-content">
      <div class="channel-header">
        <button class="mobile-menu-btn" onClick={props.onMenuClick}><IconMenu size={20} /></button>
        <Show when={channel()?.type === "text"}>
          <IconHash size={16} class="hash" />
        </Show>
        <span>{channelDisplayName()}</span>
        <button class="pin-header-btn" onClick={loadPinnedMessages} title="Pinned messages">
          <IconPin size={16} />
        </button>
      </div>

      {/* Pinned messages panel */}
      <Show when={showPins()}>
        <div class="modal-overlay" onClick={() => setShowPins(false)}>
          <div class="modal pinned-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}>
              <h2>Pinned Messages</h2>
              <button onClick={() => setShowPins(false)} style={{ color: "var(--text-muted)", padding: "4px" }}><IconX size={16} /></button>
            </div>
            <Show when={pinnedMessages().length === 0}>
              <p style={{ color: "var(--text-muted)", "font-family": "var(--font-mono)", "font-size": "13px", padding: "16px 0" }}>No pinned messages in this channel.</p>
            </Show>
            <div class="pinned-list">
              <For each={pinnedMessages()}>
                {(msg) => (
                  <div class="pinned-item">
                    <div class="pinned-item-header">
                      <img class="avatar" src={msg.author?.avatar_url ?? "https://github.com/ghost.png"} alt="" style={{ width: "20px", height: "20px", "border-radius": "2px" }} />
                      <span class="message-author">{msg.author?.display_name ?? msg.author?.username ?? "Unknown"}</span>
                      <span class="message-time">{formatTime(msg.created_at)}</span>
                    </div>
                    <div class="message-content" innerHTML={renderMarkdown(msg.content, customEmojis())} />
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      <div class="messages-container" ref={containerRef} onScroll={checkAutoScroll}>
        <For each={messages()}>
          {(msg, idx) => {
            const compact = () => isCompact(msg, idx());
            return (
              <div
                class={`message ${compact() ? "compact" : ""} ${msg.pinned ? "pinned" : ""}`}
                onContextMenu={(e) => handleContextMenu(e, msg)}
                onClick={(e) => handleMessageClick(e, msg)}
              >
                {/* Reply reference */}
                <Show when={msg.reply_to}>
                  <div class="reply-reference">
                    <div class="reply-line" />
                    <img class="reply-avatar" src={msg.reply_to!.author?.avatar_url ?? "https://github.com/ghost.png"} alt="" />
                    <span class="reply-author">{msg.reply_to!.author?.display_name ?? msg.reply_to!.author?.username ?? "Unknown"}</span>
                    <span class="reply-text">{truncate(msg.reply_to!.content, 80)}</span>
                  </div>
                </Show>
                <div class="message-row">
                  <Show when={!compact()}>
                    <img class="avatar" src={msg.author?.avatar_url ?? `https://github.com/ghost.png`} alt="" />
                  </Show>
                  <Show when={compact()}>
                    <div style={{ width: "40px", "flex-shrink": "0" }} />
                  </Show>
                  <div class="message-body">
                    <Show when={!compact()}>
                      <div class="message-header">
                        <span class="message-author">{msg.author?.display_name ?? msg.author?.username ?? "Unknown"}</span>
                        <span class="message-time">{formatTime(msg.created_at)}</span>
                      </div>
                    </Show>
                    <Show when={editingId() === msg.id} fallback={
                      <div class="message-content">
                        <span innerHTML={renderMarkdown(msg.content, customEmojis())} />
                        <Show when={msg.edited_at}>
                          <span class="message-edited">(edited)</span>
                        </Show>
                      </div>
                    }>
                      <textarea
                        class="edit-input"
                        value={editText()}
                        onInput={(e) => setEditText(e.currentTarget.value)}
                        onKeyDown={handleEditKeyDown}
                        autofocus
                        rows={1}
                      />
                      <div class="edit-hint">Enter to save, Escape to cancel</div>
                    </Show>
                    <Show when={msg.pinned && editingId() !== msg.id}>
                      <div class="pin-badge"><IconPin size={10} /> pinned</div>
                    </Show>
                    <Show when={(msg.reactions ?? []).length > 0}>
                      <div class="reactions-row">
                        <For each={msg.reactions ?? []}>
                          {(reaction) => {
                            const resolved = resolveCustomEmoji(reaction.emoji);
                            const hasReacted = () => reaction.users.includes(state.user?.id ?? -1);
                            const reactionTitle = () => {
                              const emojiLabel = resolved.isCustom ? `:${resolved.name}:` : reaction.emoji;
                              const userNames = reaction.users.map((uid) => {
                                const u = state.users.find((u) => u.id === uid);
                                return u?.display_name || u?.username || `User ${uid}`;
                              });
                              return userNames.length > 0
                                ? `${emojiLabel}\n${userNames.join(", ")}`
                                : emojiLabel;
                            };
                            return (
                              <button
                                class={`reaction-chip ${hasReacted() ? "reacted" : ""}`}
                                onClick={() => toggleReaction(msg.id, reaction.emoji)}
                                title={reactionTitle()}
                              >
                                <Show when={resolved.isCustom} fallback={
                                  <span class="reaction-emoji">{reaction.emoji}</span>
                                }>
                                  <img
                                    src={resolved.url}
                                    alt={resolved.name}
                                    class="reaction-custom-img"
                                    onError={(e) => {
                                      const target = e.currentTarget;
                                      target.style.display = "none";
                                      const fallback = document.createElement("span");
                                      fallback.textContent = `:${resolved.name}:`;
                                      fallback.className = "reaction-emoji-fallback";
                                      target.parentElement?.insertBefore(fallback, target);
                                    }}
                                  />
                                </Show>
                                <span class="reaction-count">{reaction.count}</span>
                              </button>
                            );
                          }}
                        </For>
                        <button
                          class="reaction-chip add-reaction"
                          onClick={(e) => { e.stopPropagation(); setEmojiPickerMsgId(msg.id); }}
                          title="Add reaction"
                        >+</button>
                      </div>
                    </Show>
                  </div>
                  <Show when={editingId() !== msg.id}>
                    <div class="message-actions">
                      <button onClick={(e) => { e.stopPropagation(); setEmojiPickerMsgId(msg.id); }} title="Add reaction">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                          <line x1="9" y1="9" x2="9.01" y2="9" />
                          <line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                      </button>
                      <button onClick={(e) => handleMoreClick(e, msg)} title="More"><IconMoreHorizontal size={14} /></button>
                    </div>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
        <div ref={messagesEndRef} />
      </div>

      {/* Context Menu */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div
            class="context-menu"
            style={{ left: menu().x + "px", top: menu().y + "px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button class="context-menu-item" onClick={() => startReply(menu().message)}>
              <IconReply size={14} /> Reply
            </button>
            <button class="context-menu-item" onClick={() => copyMessage(menu().message)}>
              <IconCopy size={14} /> Copy
            </button>
            <button class="context-menu-item" onClick={() => togglePin(menu().message)}>
              <IconPin size={14} /> {menu().message.pinned ? "Unpin" : "Pin"}
            </button>
            <Show when={menu().message.author_id === state.user?.id}>
              <div class="context-menu-separator" />
              <button class="context-menu-item" onClick={() => startEdit(menu().message)}>
                <IconEdit size={14} /> Edit
              </button>
              <button class="context-menu-item danger" onClick={() => { setShowDeleteConfirm(menu().message.id); setContextMenu(null); }}>
                <IconTrash size={14} /> Delete
              </button>
            </Show>
          </div>
        )}
      </Show>

      {/* Delete confirmation modal */}
      <Show when={showDeleteConfirm()}>
        <div class="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete Message</h2>
            <p style={{ color: "var(--text-secondary)", "font-family": "var(--font-mono)", "font-size": "13px", "margin-bottom": "16px" }}>
              Are you sure you want to delete this message? This cannot be undone.
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button class="btn btn-danger" onClick={() => handleDelete(showDeleteConfirm()!)}>Delete</button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={hasNewBelow()}>
        <button class="new-messages-btn" onClick={scrollToBottom}>
          New messages below
        </button>
      </Show>

      <div class="typing-indicator">
        <Show when={typingUsers().length > 0}>
          {(() => {
            const users = typingUsers();
            if (users.length === 1) return `${users[0].username} is typing...`;
            if (users.length === 2) return `${users[0].username} and ${users[1].username} are typing...`;
            return `${users.length} people are typing...`;
          })()}
        </Show>
      </div>

      {/* Reply preview bar */}
      <Show when={replyTo()}>
        <div class="reply-bar">
          <span class="reply-bar-label">Replying to</span>
          <span class="reply-bar-author">{replyTo()!.author?.display_name ?? replyTo()!.author?.username ?? "Unknown"}</span>
          <span class="reply-bar-text">{truncate(replyTo()!.content, 60)}</span>
          <button class="reply-bar-close" onClick={() => setReplyTo(null)}><IconX size={14} /></button>
        </div>
      </Show>

      <div class="input-area">
        <div class="input-wrapper">
          <RichInput
            placeholder={`Message ${channel()?.type === "dm" ? channelDisplayName() : "#" + channelDisplayName()}`}
            customEmojis={customEmojis()}
            onSend={handleSend}
            onTyping={handleInputTyping}
            ref={(el) => { inputRef = el; }}
          />
          <button
            class="input-emoji-btn"
            onClick={(e) => { e.stopPropagation(); setShowInputEmojiPicker((v) => !v); }}
            title="Emoji"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          <button
            class="input-send-btn"
            onClick={() => {
              if (!inputRef) return;
              const ri = (inputRef as any).__richInput;
              if (!ri) return;
              const text = ri.extractText().trim();
              if (!text) return;
              handleSend(text);
              ri.clear();
            }}
            title="Send"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>

      <Show when={showInputEmojiPicker()}>
        <div class="emoji-picker-overlay">
          <EmojiPicker
            onSelect={handleInputEmojiSelect}
            onClose={() => setShowInputEmojiPicker(false)}
            onCustomEmojiAdded={handleCustomEmojiAdded}
          />
        </div>
      </Show>

      <Show when={emojiPickerMsgId() !== null}>
        <div class="emoji-picker-overlay">
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setEmojiPickerMsgId(null)}
            onCustomEmojiAdded={handleCustomEmojiAdded}
          />
        </div>
      </Show>
    </div>
  );
}
