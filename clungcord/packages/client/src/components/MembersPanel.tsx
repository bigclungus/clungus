import { For, Show, createMemo } from "solid-js";
import store from "../stores/app.ts";
import * as api from "../api.ts";
import type { User } from "@clungcord/shared";

export default function MembersPanel() {
  const { state, setActiveChannel, addChannel } = store;

  const members = createMemo(() => {
    const channelId = state.activeChannelId;
    if (!channelId) return [];
    return state.members[channelId] ?? [];
  });

  const onlineMembers = createMemo(() => members().filter((m) => m.status === "online"));
  const offlineMembers = createMemo(() => members().filter((m) => m.status !== "online"));

  async function startDM(user: User) {
    if (user.id === state.user?.id) return;
    const channel = await api.createDM(user.id);
    addChannel(channel);
    setActiveChannel(channel.id);
  }

  return (
    <div class="members-panel">
      <Show when={onlineMembers().length > 0}>
        <div class="members-section-header">Online — {onlineMembers().length}</div>
        <For each={onlineMembers()}>
          {(member) => (
            <div class="member-item online" onClick={() => startDM(member)}>
              <img class="avatar" src={member.avatar_url ?? "https://github.com/ghost.png"} alt="" />
              <span class="name">
                <span class="status-dot online" />
                {member.display_name ?? member.username}
              </span>
            </div>
          )}
        </For>
      </Show>

      <Show when={offlineMembers().length > 0}>
        <div class="members-section-header">Offline — {offlineMembers().length}</div>
        <For each={offlineMembers()}>
          {(member) => (
            <div class="member-item" onClick={() => startDM(member)}>
              <img class="avatar" src={member.avatar_url ?? "https://github.com/ghost.png"} alt="" />
              <span class="name">
                <span class="status-dot offline" />
                {member.display_name ?? member.username}
              </span>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
