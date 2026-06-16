<script lang="ts">
  
  import { marked } from 'marked';
  import hljs from 'highlight.js';
  import type { Message } from '../stores/conversation';

  // ── Props ───────────────────────────────────────────────────────────────

  export let message: Message;
  export let isStreaming = false;

  // ── State ───────────────────────────────────────────────────────────────

  let renderedHTML = '';
  let showTimestamp = false;

  // ── Configure marked with highlight.js ──────────────────────────────────

  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight(code: string, lang: string): string {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (_) {
          // fall through
        }
      }
      // No language or unknown — escape HTML and return
      return code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },
  } as any);

  // ── Render markdown ─────────────────────────────────────────────────────

  $: {
    try {
      renderedHTML = marked.parse(message.content) as string;
    } catch (_) {
      renderedHTML = message.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }

  // ── Copy code block ─────────────────────────────────────────────────────


  // ── Time formatting ─────────────────────────────────────────────────────

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return formatTime(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + formatTime(ts);
  }
</script>

<div
  class="message-bubble {message.role === 'user' ? 'user' : 'assistant'} {isStreaming ? 'streaming' : ''}"
  on:mouseenter={() => (showTimestamp = true)}
  on:mouseleave={() => (showTimestamp = false)}
  role="listitem"
  aria-label="{message.role} message"
>
  <!-- Avatar -->
  <div class="avatar {message.role}">
    {#if message.role === 'user'}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    {:else}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l6.58-6.58a1 1 0 0 0 0-1.42L12 2Z" />
        <path d="M7 7h.01" />
      </svg>
    {/if}
  </div>

  <!-- Bubble content -->
  <div class="bubble {message.role}">
    <div class="bubble-header">
      <span class="role-label">{message.role === 'user' ? 'You' : 'Mambru'}</span>
      {#if showTimestamp}
        <span class="timestamp">{formatDate(message.timestamp)}</span>
      {/if}
    </div>

    <div class="bubble-body">
      {#if message.role === 'assistant'}
        <!-- Markdown rendered for assistant -->
        <div class="markdown-content">
          {@html renderedHTML}
        </div>
        {#if isStreaming}
          <span class="cursor" aria-hidden="true">|</span>
        {/if}
      {:else}
        <!-- Plain text for user messages -->
        <p class="user-text">{message.content}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .message-bubble {
    display: flex;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
    max-width: 85%;
    animation: fadeIn 0.2s ease;
  }

  .message-bubble.user {
    flex-direction: row-reverse;
    align-self: flex-end;
  }

  .message-bubble.assistant {
    align-self: flex-start;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Avatar ────────────────────────────────── */

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: 600;
    font-size: var(--font-size-sm);
  }

  .avatar.user {
    background: var(--color-user-bubble);
    color: var(--color-user-bubble-text);
  }

  .avatar.assistant {
    background: var(--color-bg-tertiary);
    color: var(--color-accent);
  }

  /* ── Bubble ────────────────────────────────── */

  .bubble {
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
    position: relative;
    min-width: 60px;
  }

  .bubble.user {
    background: var(--color-user-bubble);
    color: var(--color-user-bubble-text);
    border-bottom-right-radius: var(--radius-sm);
  }

  .bubble.assistant {
    background: var(--color-assistant-bubble);
    color: var(--color-assistant-bubble-text);
    border: 1px solid var(--color-border);
    border-bottom-left-radius: var(--radius-sm);
  }

  .bubble-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .role-label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }

  .timestamp {
    font-size: var(--font-size-xs);
    opacity: 0.5;
    margin-left: auto;
  }

  .bubble-body {
    line-height: 1.6;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .user-text {
    white-space: pre-wrap;
    margin: 0;
  }

  /* ── Streaming cursor ──────────────────────── */

  .cursor {
    display: inline-block;
    animation: blink 0.8s step-end infinite;
    color: var(--color-accent);
    font-weight: bold;
    margin-left: 1px;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }

  /* ── Markdown content overrides ────────────── */

  .markdown-content :global(p) {
    margin: 0 0 var(--space-sm) 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(pre) {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    overflow-x: auto;
    margin: var(--space-sm) 0;
    position: relative;
  }

  .markdown-content :global(code) {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  .markdown-content :global(:not(pre) > code) {
    background: var(--color-bg-secondary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 0.9em;
  }

  .markdown-content :global(ul), 
  .markdown-content :global(ol) {
    padding-left: var(--space-lg);
    margin: var(--space-sm) 0;
  }

  .markdown-content :global(li) {
    margin: var(--space-xs) 0;
  }

  .markdown-content :global(a) {
    color: var(--color-primary);
    text-decoration: none;
  }

  .markdown-content :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-content :global(blockquote) {
    border-left: 3px solid var(--color-primary);
    padding-left: var(--space-md);
    margin: var(--space-sm) 0;
    color: var(--color-text-secondary);
  }

  .markdown-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: var(--space-sm) 0;
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    border: 1px solid var(--color-border);
    padding: var(--space-xs) var(--space-sm);
    text-align: left;
  }

  .markdown-content :global(th) {
    background: var(--color-bg-secondary);
    font-weight: 600;
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4) {
    margin: var(--space-md) 0 var(--space-sm) 0;
    color: var(--color-text);
  }

  .markdown-content :global(h1) { font-size: 1.3em; }
  .markdown-content :global(h2) { font-size: 1.15em; }
  .markdown-content :global(h3) { font-size: 1.05em; }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: var(--space-md) 0;
  }
</style>
