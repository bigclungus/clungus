import { For, Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import store from "../stores/app.ts";
import * as api from "../api.ts";
import { IconX, IconPlus, IconEdit, IconTrash } from "./Icons.tsx";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface ChannelContextMenuState {
  x: number;
  y: number;
  channelId: number;
  channelName: string;
}

export default function Sidebar(props: SidebarProps) {
  const { state, setActiveChannel, addChannel, removeChannel } = store;
  const [showCreate, setShowCreate] = createSignal(false);
  const [newChannelName, setNewChannelName] = createSignal("");
  const [allChannels, setAllChannels] = createSignal<any[]>([]);
  const [channelCtx, setChannelCtx] = createSignal<ChannelContextMenuState | null>(null);
  const [showRename, setShowRename] = createSignal(false);
  const [renameTarget, setRenameTarget] = createSignal<{ id: number; name: string } | null>(null);
  const [renameName, setRenameName] = createSignal("");
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal<{ id: number; name: string } | null>(null);

  const joinedTextChannels = () => state.channels.filter((c) => c.type === "text");
  const dmChannels = () => state.channels.filter((c) => c.type === "dm");
  const joinedIds = () => new Set(state.channels.map((c) => c.id));

  const visibleChannels = () => {
    const joined = joinedTextChannels();
    const joinedSet = joinedIds();
    const unjoined = allChannels().filter((c) => c.type === "text" && !joinedSet.has(c.id));
    return [...joined, ...unjoined];
  };

  createEffect(() => {
    if (state.connected) {
      api.getAllChannels()
        .then((channels) => setAllChannels(channels))
        .catch((err) => console.error("[sidebar] failed to load channels:", err));
    }
  });

  // Close channel context menu on click outside
  function handleGlobalClick() {
    setChannelCtx(null);
  }
  onMount(() => document.addEventListener("click", handleGlobalClick));
  onCleanup(() => document.removeEventListener("click", handleGlobalClick));

  async function handleCreateChannel() {
    const name = newChannelName().trim();
    if (!name) return;
    const channel = await api.createChannel(name);
    await api.joinChannel(channel.id);
    addChannel(channel);
    setActiveChannel(channel.id);
    setNewChannelName("");
    setShowCreate(false);
  }

  async function selectChannel(channelId: number) {
    if (!joinedIds().has(channelId)) {
      await api.joinChannel(channelId);
      const channel = allChannels().find((c) => c.id === channelId);
      if (channel) addChannel(channel);
    }
    setActiveChannel(channelId);
    props.onClose();
  }

  function handleChannelContextMenu(e: MouseEvent, channelId: number, channelName: string) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 120);
    setChannelCtx({ x, y, channelId, channelName });
  }

  function startRename() {
    const ctx = channelCtx();
    if (!ctx) return;
    setRenameTarget({ id: ctx.channelId, name: ctx.channelName });
    setRenameName(ctx.channelName);
    setShowRename(true);
    setChannelCtx(null);
  }

  async function submitRename() {
    const target = renameTarget();
    const name = renameName().trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!target || !name) return;
    await api.renameChannel(target.id, name);
    setShowRename(false);
    setRenameTarget(null);
    // Refresh channels
    const channels = await api.getAllChannels();
    setAllChannels(channels);
  }

  function startDelete() {
    const ctx = channelCtx();
    if (!ctx) return;
    setShowDeleteConfirm({ id: ctx.channelId, name: ctx.channelName });
    setChannelCtx(null);
  }

  async function confirmDelete() {
    const target = showDeleteConfirm();
    if (!target) return;
    await api.deleteChannel(target.id);
    removeChannel(target.id);
    setShowDeleteConfirm(null);
    // Refresh channels
    const channels = await api.getAllChannels();
    setAllChannels(channels);
  }

  function dmDisplayName(channel: any): string {
    if (!state.user) return channel.name;
    const names = (channel.name as string).split(",");
    return names.find((n) => n !== state.user!.username) ?? channel.name;
  }

  return (
    <div class={`sidebar ${props.open ? "open" : ""}`}>
      <div class="sidebar-header">
        <h1>Clungcord</h1>
        <button class="sidebar-close-btn" onClick={props.onClose}><IconX size={18} /></button>
      </div>

      {/* Text channels */}
      <div class="sidebar-section">
        <div class="sidebar-section-header">
          <span>Channels</span>
          <button title="Create channel" onClick={() => setShowCreate(true)}><IconPlus size={14} /></button>
        </div>
        <For each={visibleChannels()}>
          {(channel) => {
            const joined = () => joinedIds().has(channel.id);
            return (
              <div
                class={`channel-item ${state.activeChannelId === channel.id ? "active" : ""}`}
                style={!joined() ? { opacity: "0.5" } : {}}
                onClick={() => selectChannel(channel.id)}
                onContextMenu={(e) => handleChannelContextMenu(e, channel.id, channel.name)}
              >
                <span class="hash">#</span>
                <span>{channel.name}</span>
              </div>
            );
          }}
        </For>
      </div>

      {/* DMs */}
      <Show when={dmChannels().length > 0}>
        <div class="sidebar-section">
          <div class="sidebar-section-header">
            <span>Direct Messages</span>
          </div>
          <For each={dmChannels()}>
            {(channel) => (
              <div
                class={`dm-item ${state.activeChannelId === channel.id ? "active" : ""}`}
                onClick={() => selectChannel(channel.id)}
              >
                <span>{dmDisplayName(channel)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* User panel */}
      <Show when={state.user}>
        <div class="user-panel">
          <img class="avatar" src={state.user!.avatar_url ?? ""} alt="" />
          <div>
            <div class="username">{state.user!.display_name ?? state.user!.username}</div>
          </div>
        </div>
      </Show>

      {/* Channel context menu */}
      <Show when={channelCtx()}>
        {(ctx) => (
          <div
            class="context-menu"
            style={{ left: ctx().x + "px", top: ctx().y + "px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button class="context-menu-item" onClick={startRename}>
              <IconEdit size={14} /> Rename
            </button>
            <button class="context-menu-item danger" onClick={startDelete}>
              <IconTrash size={14} /> Delete
            </button>
          </div>
        )}
      </Show>

      {/* Create channel modal */}
      <Show when={showCreate()}>
        <div class="modal-overlay" onClick={() => setShowCreate(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create Channel</h2>
            <input
              type="text"
              placeholder="channel-name"
              value={newChannelName()}
              onInput={(e) => setNewChannelName(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
              autofocus
            />
            <div class="modal-actions">
              <button class="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button class="btn btn-primary" onClick={handleCreateChannel}>Create</button>
            </div>
          </div>
        </div>
      </Show>

      {/* Rename channel modal */}
      <Show when={showRename()}>
        <div class="modal-overlay" onClick={() => setShowRename(false)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Rename Channel</h2>
            <input
              type="text"
              placeholder="new-channel-name"
              value={renameName()}
              onInput={(e) => setRenameName(e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              onKeyDown={(e) => e.key === "Enter" && submitRename()}
              autofocus
            />
            <div class="modal-actions">
              <button class="btn btn-secondary" onClick={() => setShowRename(false)}>Cancel</button>
              <button class="btn btn-primary" onClick={submitRename}>Rename</button>
            </div>
          </div>
        </div>
      </Show>

      {/* Delete channel confirmation */}
      <Show when={showDeleteConfirm()}>
        <div class="modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Delete Channel</h2>
            <p style={{ color: "var(--text-secondary)", "font-family": "var(--font-mono)", "font-size": "13px", "margin-bottom": "16px" }}>
              Delete <strong>#{showDeleteConfirm()!.name}</strong>? All messages will be lost.
            </p>
            <div class="modal-actions">
              <button class="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button class="btn btn-danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
