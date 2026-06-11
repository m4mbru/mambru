<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { conversation } from '../stores/conversation';
  import { settings } from '../stores/settings';
  import {
    sendMessage,
    listenForTokens,
    listenForDone,
    listenForError,
    getHistory,
  } from '../api/llm';
  import { invoke } from '@tauri-apps/api/core';

  const flog = (msg: string) => invoke('log_debug', { msg }).catch(() => {});
  import { listenForCmdAutoResult, listenForCmdConfirm, listenForCmdPreview } from '../api/tools';
  import type { PendingExecutionEvent } from '../api/tools';
  import MessageBubble from './MessageBubble.svelte';
  import VoiceControls from './VoiceControls.svelte';
  import ConfirmationDialog from './ConfirmationDialog.svelte';
  import HologramWidget from './HologramWidget.svelte';

  // ── State ───────────────────────────────────────────────────────────────

  let inputValue = '';
  let inputElement: HTMLTextAreaElement;
  let messagesContainer: HTMLDivElement;
  let loading = true;
  let streaming = false;
  let pendingExecution: PendingExecutionEvent | null = null;
  let showScrollButton = false;
  let userScrolledUp = false;
  let unlisteners: Array<() => void> = [];

  // Derived: active conversation messages
  $: activeMessages = $conversation.activeId
    ? $conversation.conversations.find((c) => c.id === $conversation.activeId)?.messages ?? []
    : [];
  $: streaming = $conversation.streaming;

  // ── Image upload ─────────────────────────────────────────────────────────

  let fileInput: HTMLInputElement;

  function handleImageUpload() {
    // Create a hidden file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        // Append as a user message with the image
        conversation.appendMessage({
          role: 'user',
          content: `[Image: ${file.name}]\n${dataUrl}`,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // ── Auto-scroll ─────────────────────────────────────────────────────────

  function scrollToBottom(smooth = true) {
    if (!messagesContainer) return;
    const el = messagesContainer;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    userScrolledUp = false;
  }

  function handleScroll() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    userScrolledUp = !isAtBottom;
    showScrollButton = !isAtBottom && activeMessages.length > 0;
  }

  // Auto-scroll after every update (new message or token)
  afterUpdate(() => {
    if (!userScrolledUp && messagesContainer) {
      scrollToBottom(false);
    }
  });

  // ── Send message ────────────────────────────────────────────────────────

  async function handleSend() {
    const text = inputValue.trim();
    await flog(`handleSend called, text="${text.substring(0, 50)}", streaming=${streaming}, activeId=${$conversation.activeId}`);
    if (!text || streaming) return;

    inputValue = '';
    resetInputHeight();

    // Optimistically add user message
    conversation.appendMessage({ role: 'user', content: text });
    const activeConv = $conversation.conversations.find(c => c.id === $conversation.activeId);
    await flog(`after appendMessage, activeMessages.length=${activeConv?.messages.length}`);
    conversation.setStreaming(true);
    await flog(`after setStreaming(true), streaming=${$conversation.streaming}`);

    try {
      // Set up event listeners for this send
      await flog('before listenForTokens');
      const tokenUnlisten = await listenForTokens((token) => {
        conversation.appendToken(token);
      });
      await flog('after listenForTokens');

      await flog('before listenForDone');
      const doneUnlisten = await listenForDone((_fullResponse) => {
        conversation.setStreaming(false);
        tokenUnlisten();
        doneUnlisten();
      });
      await flog('after listenForDone');

      await flog('before listenForError');
      const errorUnlisten = await listenForError((error) => {
        conversation.setStreaming(false);
        conversation.appendMessage({
          role: 'assistant',
          content: `⚠️ Error: ${error}\n\n> Please try again or check your provider settings.`,
        });
        tokenUnlisten();
        errorUnlisten();
      });
      await flog('after listenForError');

      // Store for cleanup
      unlisteners.push(tokenUnlisten, doneUnlisten, errorUnlisten);

      // Send the message via IPC
      const activeId = $conversation.activeId;
      await flog(`before sendMessage invoke, activeId=${activeId}`);
      const result = await sendMessage(text, activeId);
      await flog(`after sendMessage invoke, result=${result}`);

      // If the backend returned a different conversation ID than we sent,
      // update the store so subsequent messages append to the same
      // backend conversation (e.g. first message where the backend
      // auto-created a new conversation with a UUID).
      if (result && result !== activeId) {
        conversation.switchConversation(result);
        await flog(`switched to conversation id=${result}`);
      }
    } catch (err) {
      await flog(`CATCH: ${err}`);
      conversation.setStreaming(false);
      conversation.appendMessage({
        role: 'assistant',
        content: `⚠️ Failed to send message: ${err}`,
      });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Stop streaming ──────────────────────────────────────────────────────

  function handleStop() {
    conversation.setStreaming(false);
    // The backend will detect the drop of the stream receiver and cancel
    conversation.discardPartialMessage();
  }

  // ── Input auto-resize ───────────────────────────────────────────────────

  function resetInputHeight() {
    if (inputElement) {
      inputElement.style.height = 'auto';
    }
  }

  function autoResize() {
    if (inputElement) {
      inputElement.style.height = 'auto';
      inputElement.style.height = Math.min(inputElement.scrollHeight, 200) + 'px';
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  onMount(async () => {
    try {
      // Load conversation history from backend
      const history = await getHistory();
      // Use the conversation titles from history to initialise
      if (history.length > 0) {
        // The store handles display; just mark as loaded
        loading = false;
      } else {
        loading = false;
      }
    } catch (_) {
      // Backend may not be ready — continue with local state
      loading = false;
    }

    // Listen for auto-executed command results (Safe commands)
    const autoResultUnlisten = await listenForCmdAutoResult((payload) => {
      conversation.appendMessage({
        role: 'assistant',
        content: payload.result.output,
      });
    });
    unlisteners.push(autoResultUnlisten);

    // Listen for Medium-risk command confirmation requests
    const confirmUnlisten = await listenForCmdConfirm((payload) => {
      pendingExecution = payload;
    });
    unlisteners.push(confirmUnlisten);

    // Listen for Dangerous-risk command preview requests
    const previewUnlisten = await listenForCmdPreview((payload) => {
      pendingExecution = payload;
    });
    unlisteners.push(previewUnlisten);
  });

  onDestroy(() => {
    unlisteners.forEach((fn) => fn());
  });

  // ── Confirmation dialog handlers ────────────────────────────────────────

  function handleDialogResolve(_event: CustomEvent<{ id: string; approved: boolean }>) {
    pendingExecution = null;
  }

  function handleDialogAlwaysAllow(_event: CustomEvent<{ id: string; commandName: string }>) {
    pendingExecution = null;
  }
</script>

<div class="chat-container">
  <!-- Loading state -->
  {#if loading}
    <div class="state-container">
      <div class="loading-spinner" aria-label="Loading">
        <div class="spinner"></div>
        <span>Loading conversations...</span>
      </div>
    </div>

  <!-- Empty state -->
  {:else if activeMessages.length === 0 && !streaming}
    <div class="state-container">
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2
          class="empty-title"
          role="button"
          tabindex="-1"
          on:click={() => inputElement?.focus()}
          on:keydown={(e) => e.key === 'Enter' && inputElement?.focus()}
        >Ask me anything, che</h2>
        <p class="empty-subtitle">
          Send a message or press <kbd>Ctrl+N</kbd> to start a new conversation.
        </p>
      </div>
    </div>

  <!-- Messages -->
  {:else}
    <div
      class="messages-container"
      bind:this={messagesContainer}
      on:scroll={handleScroll}
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      <div class="messages-list">
        {#each activeMessages as msg, i}
          {#if msg.role !== 'system'}
            <MessageBubble
              message={msg}
              isStreaming={streaming && i === activeMessages.length - 1 && msg.role === 'assistant'}
            />
          {/if}
        {/each}

        <!-- Typing indicator (when streaming but no tokens yet) -->
        {#if streaming && activeMessages[activeMessages.length - 1]?.role !== 'assistant'}
          <div class="typing-indicator">
            <div class="avatar assistant">
              <span>M</span>
            </div>
            <div class="typing-dots">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Scroll to bottom button -->
      {#if showScrollButton}
        <button class="scroll-btn" on:click={() => scrollToBottom(true)} title="Scroll to bottom">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Input area -->
  <div class="input-area">
    <div class="input-bar">
      <textarea
        bind:this={inputElement}
        bind:value={inputValue}
        on:keydown={handleKeydown}
        on:input={autoResize}
        placeholder="Ask me anything, che..."
        rows="1"
        disabled={streaming}
        class:input-disabled={streaming}
        autofocus
        aria-label="Message input"
      ></textarea>

      {#if streaming}
        <button class="send-btn stop-btn" on:click={handleStop} title="Stop streaming" aria-label="Stop">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      {:else}
        <button
          class="send-btn img-btn"
          on:click={handleImageUpload}
          disabled={streaming}
          title="Attach image"
          aria-label="Attach image"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        <button
          class="send-btn"
          on:click={handleSend}
          disabled={!inputValue.trim()}
          title="Send message"
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Voice controls -->
    <VoiceControls />
  </div>
</div>

<!-- Confirmation dialog (global for this chat) -->
<ConfirmationDialog
  pending={pendingExecution}
  on:resolve={handleDialogResolve}
  on:alwaysAllow={handleDialogAlwaysAllow}
/>

<!-- Holographic avatar overlay -->
<HologramWidget />

<style>
  .chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    position: relative;
  }

  /* ── State Containers ───────────────────────── */

  .state-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
  }

  .loading-spinner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    text-align: center;
    max-width: 360px;
  }

  .empty-icon {
    color: var(--color-text-muted);
    opacity: 0.5;
    margin-bottom: var(--space-md);
  }

  .empty-title {
    font-size: 1.3rem;
    font-weight: 600;
    margin-bottom: var(--space-sm);
    color: var(--color-text);
  }

  .empty-subtitle {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .empty-subtitle kbd {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 0 4px;
    font-family: var(--font-sans);
    font-size: var(--font-size-xs);
  }

  /* ── Messages ───────────────────────────────── */

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md) var(--space-lg);
    position: relative;
    scroll-behavior: smooth;
  }

  .messages-list {
    display: flex;
    flex-direction: column;
  }

  /* ── Typing indicator ────────────────────────── */

  .typing-indicator {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
    margin-top: var(--space-sm);
    animation: fadeIn 0.3s ease;
  }

  .typing-indicator .avatar {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-full);
    background: var(--color-bg-tertiary);
    color: var(--color-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: var(--font-size-sm);
    flex-shrink: 0;
  }

  .typing-dots {
    display: flex;
    gap: 4px;
    padding: var(--space-sm) var(--space-md);
    background: var(--color-assistant-bubble);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    border-bottom-left-radius: var(--radius-sm);
  }

  .dot {
    width: 6px;
    height: 6px;
    background: var(--color-text-muted);
    border-radius: 50%;
    animation: bounce 1.4s ease-in-out infinite;
  }

  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-4px); }
  }

  /* ── Scroll button ───────────────────────────── */

  .scroll-btn {
    position: absolute;
    bottom: var(--space-md);
    right: var(--space-lg);
    width: 32px;
    height: 32px;
    border-radius: var(--radius-full);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-md);
    transition: all var(--transition-fast);
  }

  .scroll-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  /* ── Input Area ──────────────────────────────── */

  .input-area {
    padding: var(--space-sm) var(--space-lg) var(--space-md);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .input-bar {
    display: flex;
    gap: var(--space-sm);
    align-items: flex-end;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-xs);
    transition: border-color var(--transition-fast);
  }

  .input-bar:focus-within {
    border-color: var(--color-border-focus);
  }

  textarea {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--font-size-md);
    line-height: 1.5;
    padding: var(--space-sm);
    resize: none;
    outline: none;
    min-height: var(--input-min-height);
    max-height: 200px;
  }

  textarea::placeholder {
    color: var(--color-text-muted);
  }

  textarea.input-disabled {
    opacity: 0.6;
  }

  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition-fast);
    background: var(--color-primary);
    color: #fff;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn.stop-btn {
    background: var(--color-danger);
  }

  .send-btn.stop-btn:hover {
    background: #e05555;
  }

  .send-btn.img-btn {
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
  }

  .send-btn.img-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
</style>
