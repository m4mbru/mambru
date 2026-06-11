<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { settings } from './lib/stores/settings';
  import { conversation } from './lib/stores/conversation';
  import { hasMissing, init as initModels, destroy as destroyModels } from './lib/stores/models';
  import Chat from './lib/components/Chat.svelte';
  import Settings from './lib/components/Settings.svelte';
  import DownloadDialog from './lib/components/DownloadDialog.svelte';

  // ── State ───────────────────────────────────────────────────────────────

  let settingsOpen = false;
  let showDownloadDialog = false;
  let conversationSearch = '';

  // Derived: side conversations for the sidebar
  $: conversations = $conversation.conversations;
  $: activeId = $conversation.activeId;
  $: streaming = $conversation.streaming;

  $: filteredConversations = conversationSearch
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(conversationSearch.toLowerCase()),
      )
    : conversations;

  // ── Theme handling ──────────────────────────────────────────────────────

  $: if ($settings) {
    applyTheme($settings.appearance.theme);
  }

  function applyTheme(theme: string) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : '';
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  function handleKeydown(e: KeyboardEvent) {
    // Ctrl+N — new conversation
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      conversation.newConversation();
    }
    // Ctrl+, — toggle settings
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      settingsOpen = !settingsOpen;
    }
    // Ctrl+Shift+, — close settings
    if (e.ctrlKey && e.shiftKey && e.key === ',') {
      e.preventDefault();
      settingsOpen = false;
    }
    // Escape — close settings if open
    if (e.key === 'Escape' && settingsOpen) {
      settingsOpen = false;
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  onMount(async () => {
    // Initialise the conversation store IMMEDIATELY (before settings load)
    conversation.init();
    applyTheme('dark');

    // Load persisted settings on startup
    await settings.load();
    applyTheme($settings.appearance.theme);

    // Check model availability and show download dialog if models are missing
    await initModels();
    showDownloadDialog = $hasMissing;

    // Register keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    destroyModels();
  });

  // ── Error boundary ──────────────────────────────────────────────────────

  let hasError = false;
  let errorMessage = '';

  function handleError(e: ErrorEvent) {
    hasError = true;
    errorMessage = e.message || 'An unexpected error occurred';
    console.error('[App] Error boundary caught:', e);
    e.preventDefault();
  }

  onMount(() => {
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  });

  // ── Conversation actions ────────────────────────────────────────────────

  function handleNewConversation() {
    conversation.newConversation();
  }

  function handleSwitchConversation(id: string) {
    conversation.switchConversation(id);
  }

  function handleDeleteConversation(id: string) {
    conversation.deleteConversation(id);
  }

  function handleRenameConversation(id: string) {
    const title = prompt('Rename conversation:');
    if (title && title.trim()) {
      // We need to switch to the conversation first, then rename
      conversation.switchConversation(id);
      conversation.renameConversation(title.trim());
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if hasError}
  <!-- Error boundary fallback -->
  <div class="app-shell error-state">
    <div class="error-container">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <h2>Something went wrong</h2>
      <p class="error-message">{errorMessage}</p>
      <button
        class="error-reload-btn"
        on:click={() => {
          hasError = false;
          errorMessage = '';
          window.location.reload();
        }}
      >
        Reload Mambru
      </button>
    </div>
  </div>
{:else}
  <div class="app-shell">
    <!-- ── Header ──────────────────────────────────── -->
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title" title="Mambru — Desktop Assistant">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l6.58-6.58a1 1 0 0 0 0-1.42L12 2Z" />
            <path d="M7 7h.01" />
          </svg>
          <span>Mambru</span>
        </h1>
      </div>

      <div class="header-center">
        {#if activeId}
          <span class="conv-title">
            {conversations.find((c) => c.id === activeId)?.title || 'Conversation'}
            {#if streaming}
              <span class="streaming-indicator" aria-label="Streaming response">
                <span class="streaming-dot"></span>
              </span>
            {/if}
          </span>
        {/if}
      </div>

      <div class="header-right">
        <button
          class="header-btn"
          on:click={handleNewConversation}
          title="New conversation (Ctrl+N)"
          aria-label="New conversation"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          class="header-btn"
          class:active={settingsOpen}
          on:click={() => (settingsOpen = !settingsOpen)}
          title="Settings (Ctrl+,)"
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- ── Body: Sidebar + Chat ────────────────── -->
    <div class="app-body">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              bind:value={conversationSearch}
              placeholder="Search conversations..."
              aria-label="Search conversations"
            />
          </div>
        </div>

        <div class="sidebar-list">
          {#if filteredConversations.length === 0}
            <div class="sidebar-empty">
              {#if conversationSearch}
                No conversations match your search.
              {:else}
                No conversations yet.
              {/if}
            </div>
          {:else}
            {#each filteredConversations as conv}
              <button
                class="sidebar-item"
                class:active={conv.id === activeId}
                on:click={() => handleSwitchConversation(conv.id)}
                on:dblclick={() => handleRenameConversation(conv.id)}
                title={conv.title}
              >
                <div class="sidebar-item-content">
                  <span class="sidebar-item-title">{conv.title}</span>
                  <span class="sidebar-item-meta">
                    {conv.messages.length} message{conv.messages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  class="sidebar-item-delete"
                  on:click|stopPropagation={() => handleDeleteConversation(conv.id)}
                  title="Delete conversation"
                  aria-label="Delete {conv.title}"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </button>
            {/each}
          {/if}
        </div>

        <div class="sidebar-footer">
          <button class="new-chat-btn" on:click={handleNewConversation}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New conversation</span>
          </button>
        </div>
      </aside>

      <!-- Main chat area -->
      <main class="chat-area">
        <Chat />
      </main>
    </div>
  </div>

  <!-- Settings panel (slideover) -->
  <Settings open={settingsOpen} onClose={() => (settingsOpen = false)} />

  <!-- Model download dialog (shown on first launch when models are missing) -->
  <DownloadDialog show={showDownloadDialog} onSkip={() => (showDownloadDialog = false)} />
{/if}

<style>
  /* ── Shell ─────────────────────────────────────── */

  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    position: relative;
    overflow: hidden;
  }

  /* ── Header ──────────────────────────────────── */

  .app-header {
    display: flex;
    align-items: center;
    height: var(--header-height);
    padding: 0 var(--space-md);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    flex-shrink: 0;
    z-index: var(--z-chat);
  }

  .header-left {
    display: flex;
    align-items: center;
    width: var(--sidebar-width);
    flex-shrink: 0;
  }

  .app-title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
    letter-spacing: 0.3px;
  }

  .app-title svg {
    color: var(--color-primary);
  }

  .header-center {
    flex: 1;
    text-align: center;
  }

  .conv-title {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .streaming-indicator {
    display: inline-flex;
    align-items: center;
  }

  .streaming-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    animation: pulse-dot 1s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-left: auto;
  }

  .header-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .header-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
    border-color: var(--color-border);
  }

  .header-btn.active {
    background: rgba(123, 104, 238, 0.1);
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  /* ── Body ──────────────────────────────────────── */

  .app-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* ── Sidebar ──────────────────────────────────── */

  .sidebar {
    width: var(--sidebar-width);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border);
    z-index: var(--z-sidebar);
  }

  .sidebar-header {
    padding: var(--space-sm);
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-search {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    transition: border-color var(--transition-fast);
  }

  .sidebar-search:focus-within {
    border-color: var(--color-border-focus);
  }

  .sidebar-search input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text);
    font-size: var(--font-size-sm);
    outline: none;
    font-family: var(--font-sans);
  }

  .sidebar-search input::placeholder {
    color: var(--color-text-muted);
  }

  .sidebar-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-xs);
  }

  .sidebar-empty {
    padding: var(--space-xl);
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .sidebar-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    border-radius: var(--radius-md);
    text-align: left;
    margin-bottom: 1px;
    transition: background var(--transition-fast);
    font-family: var(--font-sans);
  }

  .sidebar-item:hover {
    background: var(--color-surface-hover);
  }

  .sidebar-item.active {
    background: rgba(123, 104, 238, 0.1);
    color: var(--color-primary);
  }

  .sidebar-item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .sidebar-item-title {
    font-size: var(--font-size-sm);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-item-meta {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .sidebar-item-delete {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all var(--transition-fast);
  }

  .sidebar-item:hover .sidebar-item-delete {
    color: var(--color-text-muted);
  }

  .sidebar-item-delete:hover {
    color: var(--color-danger) !important;
    background: var(--color-danger-bg);
  }

  .sidebar-footer {
    padding: var(--space-sm);
    border-top: 1px solid var(--color-border);
  }

  .new-chat-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    padding: var(--space-sm);
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: 500;
    font-family: var(--font-sans);
    transition: background var(--transition-fast);
  }

  .new-chat-btn:hover {
    background: var(--color-primary-hover);
  }

  /* ── Chat area ────────────────────────────────── */

  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    position: relative;
  }

  /* ── Error state ──────────────────────────────── */

  .error-state {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .error-container {
    text-align: center;
    max-width: 400px;
    padding: var(--space-xl);
  }

  .error-container h2 {
    font-size: 1.3rem;
    margin: var(--space-md) 0 var(--space-sm);
  }

  .error-message {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-lg);
  }

  .error-reload-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: 500;
    font-family: var(--font-sans);
  }

  .error-reload-btn:hover {
    background: var(--color-primary-hover);
  }
</style>
