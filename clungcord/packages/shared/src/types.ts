export interface User {
  id: number;
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: "online" | "away" | "offline";
  last_seen: number | null;
  created_at: number;
}

export interface Channel {
  id: number;
  name: string;
  type: "text" | "dm";
  created_at: number;
}

export interface ChannelWithMembers extends Channel {
  members: User[];
  last_message?: Message | null;
}

export interface Message {
  id: number;
  channel_id: number;
  author_id: number;
  content: string;
  reply_to_id: number | null;
  reply_to?: Message | null;
  pinned: boolean;
  edited_at: number | null;
  created_at: number;
  author?: User;
  reactions?: Reaction[];
}

export interface ChannelMember {
  channel_id: number;
  user_id: number;
  joined_at: number;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: number[]; // user IDs who reacted
}

export interface CustomEmoji {
  id: number;
  name: string;
  url: string;
  uploaded_by: number;
  created_at: number;
}
