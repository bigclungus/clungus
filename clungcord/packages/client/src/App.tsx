import { createSignal, onMount, Show } from "solid-js";
import { checkAuth } from "./api.ts";
import store from "./stores/app.ts";
import Sidebar from "./components/Sidebar.tsx";
import MessagePane from "./components/MessagePane.tsx";
import MembersPanel from "./components/MembersPanel.tsx";
import { IconMenu } from "./components/Icons.tsx";

export default function App() {
  const [authed, setAuthed] = createSignal<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const { state, connect } = store;

  onMount(async () => {
    try {
      const result = await checkAuth();
      if (result.authenticated) {
        setAuthed(true);
        connect();
      } else {
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    }
  });

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <Show when={authed() !== null} fallback={<div class="login-screen"><h1>Clungcord</h1><p>Loading...</p></div>}>
      <Show
        when={authed()}
        fallback={
          <div class="login-screen">
            <h1>Clungcord</h1>
            <p style={{ color: "var(--text-secondary)" }}>Sign in with GitHub to continue</p>
            <a href={`https://clung.us/auth/github?next=${encodeURIComponent(window.location.href)}`} class="btn btn-primary">
              Sign in with GitHub
            </a>
          </div>
        }
      >
        <div class="app">
          <div
            class={`sidebar-backdrop ${sidebarOpen() ? "visible" : ""}`}
            onClick={closeSidebar}
          />
          <Sidebar open={sidebarOpen()} onClose={closeSidebar} />
          <Show when={state.activeChannelId} fallback={
            <div class="main-content" style={{ display: "flex", "align-items": "center", "justify-content": "center" }}>
              <button class="mobile-menu-btn" onClick={() => setSidebarOpen(true)} style={{ position: "absolute", top: "12px", left: "12px" }}>
                <IconMenu size={20} />
              </button>
              <p style={{ color: "var(--text-muted)", "font-family": "var(--font-mono)" }}>Select a channel to start chatting</p>
            </div>
          }>
            <MessagePane onMenuClick={() => setSidebarOpen(true)} />
            <MembersPanel />
          </Show>
        </div>
      </Show>
    </Show>
  );
}
