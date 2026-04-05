import { createSignal, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { Channel, Message, User } from "@clungcord/shared";
import type { ServerEvent } from "@clungcord/shared";
import { WebSocketClient, getMessages as fetchMessages, getChannelMembers } from "../api.ts";

interface AppState {
  user: User | null;
  channels: Channel[];
  users: User[];
  messages: Record<number, Message[]>; // channelId -> messages
  members: Record<number, User[]>; // channelId -> members
  activeChannelId: number | null;
  typing: Record<number, { username: string; expires: number }[]>; // channelId -> typing users
  connected: boolean;
}

function createAppStore() {
  const [state, setState] = createStore<AppState>({
    user: null,
    channels: [],
    users: [],
    messages: {},
    members: {},
    activeChannelId: null,
    typing: {},
    connected: false,
  });

  const ws = new WebSocketClient();

  // Typing cleanup interval
  let typingInterval: number | null = null;

  function startTypingCleanup() {
    if (typingInterval) return;
    typingInterval = window.setInterval(() => {
      const now = Date.now();
      setState(produce((s) => {
        for (const channelId of Object.keys(s.typing)) {
          const cid = Number(channelId);
          s.typing[cid] = (s.typing[cid] ?? []).filter((t) => t.expires > now);
          if (s.typing[cid].length === 0) {
            delete s.typing[cid];
          }
        }
      }));
    }, 1000);
  }

  function handleEvent(event: ServerEvent) {
    switch (event.type) {
      case "ready": {
        // Sort channels by created_at ascending so oldest (general) is first
        const sortedChannels = [...event.channels].sort(
          (a, b) => a.created_at - b.created_at
        );
        setState({
          user: event.user,
          channels: sortedChannels,
          users: event.users,
          connected: true,
        });
        // Auto-select oldest channel (general)
        if (sortedChannels.length > 0 && !state.activeChannelId) {
          setActiveChannel(sortedChannels[0].id);
        }
        startTypingCleanup();
        break;
      }

      case "message_create":
        setState(produce((s) => {
          let msgs = s.messages[event.message.channel_id];
          if (msgs) {
            msgs.push(event.message);
          } else {
            // Channel messages not yet loaded (e.g. new DM) — initialize with this message
            s.messages[event.message.channel_id] = [event.message];
          }
          // Clear typing for this user in this channel
          const typing = s.typing[event.message.channel_id];
          if (typing) {
            const idx = typing.findIndex((t) => t.username === event.message.author?.username);
            if (idx >= 0) typing.splice(idx, 1);
          }
        }));
        break;

      case "message_update":
        setState(produce((s) => {
          const msgs = s.messages[event.message.channel_id];
          if (msgs) {
            const idx = msgs.findIndex((m) => m.id === event.message.id);
            if (idx >= 0) msgs[idx] = event.message;
          }
        }));
        break;

      case "message_delete":
        setState(produce((s) => {
          const msgs = s.messages[event.channel_id];
          if (msgs) {
            const idx = msgs.findIndex((m) => m.id === event.message_id);
            if (idx >= 0) msgs.splice(idx, 1);
          }
        }));
        break;

      case "presence_update":
        setState(produce((s) => {
          const user = s.users.find((u) => u.id === event.user_id);
          if (user) user.status = event.status;
          // Update in members lists too
          for (const channelId of Object.keys(s.members)) {
            const members = s.members[Number(channelId)];
            const member = members?.find((u) => u.id === event.user_id);
            if (member) member.status = event.status;
          }
        }));
        break;

      case "typing_start":
        setState(produce((s) => {
          if (event.user_id === s.user?.id) return;
          if (!s.typing[event.channel_id]) s.typing[event.channel_id] = [];
          const existing = s.typing[event.channel_id].findIndex((t) => t.username === event.username);
          const entry = { username: event.username, expires: Date.now() + 5000 };
          if (existing >= 0) {
            s.typing[event.channel_id][existing] = entry;
          } else {
            s.typing[event.channel_id].push(entry);
          }
        }));
        break;

      case "channel_create":
        setState(produce((s) => {
          if (!s.channels.find((c) => c.id === event.channel.id)) {
            s.channels.push(event.channel);
          }
        }));
        break;

      case "channel_update":
        setState(produce((s) => {
          const idx = s.channels.findIndex((c) => c.id === event.channel.id);
          if (idx >= 0) s.channels[idx] = event.channel;
        }));
        break;

      case "channel_delete":
        setState(produce((s) => {
          s.channels = s.channels.filter((c) => c.id !== event.channel_id);
          if (s.activeChannelId === event.channel_id) {
            s.activeChannelId = s.channels[0]?.id ?? null;
          }
        }));
        break;

      case "member_join":
        setState(produce((s) => {
          const members = s.members[event.channel_id];
          if (members && !members.find((u) => u.id === event.user.id)) {
            members.push(event.user);
          }
        }));
        break;

      case "member_leave":
        setState(produce((s) => {
          const members = s.members[event.channel_id];
          if (members) {
            const idx = members.findIndex((u) => u.id === event.user_id);
            if (idx >= 0) members.splice(idx, 1);
          }
        }));
        break;

      case "reaction_add":
      case "reaction_remove":
        setState(produce((s) => {
          const msgs = s.messages[event.channel_id];
          if (msgs) {
            const msg = msgs.find((m) => m.id === event.message_id);
            if (msg) {
              msg.reactions = event.reactions;
            }
          }
        }));
        break;

      case "message_pin":
        setState(produce((s) => {
          const msgs = s.messages[event.message.channel_id];
          if (msgs) {
            const idx = msgs.findIndex((m) => m.id === event.message.id);
            if (idx >= 0) msgs[idx].pinned = true;
          }
        }));
        break;

      case "message_unpin":
        setState(produce((s) => {
          const msgs = s.messages[event.channel_id];
          if (msgs) {
            const idx = msgs.findIndex((m) => m.id === event.message_id);
            if (idx >= 0) msgs[idx].pinned = false;
          }
        }));
        break;
    }
  }

  async function setActiveChannel(channelId: number) {
    setState("activeChannelId", channelId);
    // Load messages if not cached
    if (!state.messages[channelId]) {
      const msgs = await fetchMessages(channelId);
      setState("messages", channelId, msgs);
    }
    // Load members
    const members = await getChannelMembers(channelId);
    setState("members", channelId, members);
  }

  function addChannel(channel: Channel) {
    setState(produce((s) => {
      if (!s.channels.find((c) => c.id === channel.id)) {
        s.channels.push(channel);
      }
    }));
  }

  function removeChannel(channelId: number) {
    setState(produce((s) => {
      s.channels = s.channels.filter((c) => c.id !== channelId);
    }));
  }

  function connect() {
    ws.onEvent(handleEvent);
    ws.connect();
  }

  function sendTyping(channelId: number) {
    ws.sendTyping(channelId);
  }

  return {
    state,
    setState,
    setActiveChannel,
    addChannel,
    removeChannel,
    connect,
    sendTyping,
  };
}

export default createRoot(createAppStore);
