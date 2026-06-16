<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fly, scale } from 'svelte/transition';
  import { confirmExecution } from '../api/tools';
  import type { PendingExecutionEvent } from '../api/tools';
  import { conversation } from '../stores/conversation';

  // ── Props ───────────────────────────────────────────────────────────────

  export let pending: PendingExecutionEvent | null = null;

  // ── Dispatch ────────────────────────────────────────────────────────────

  const dispatch = createEventDispatcher<{
    resolve: { id: string; approved: boolean };
    alwaysAllow: { id: string; commandName: string };
  }>();

  // ── State ───────────────────────────────────────────────────────────────

  let showFullPreview = false;
  let processing = false;

  // ── Actions ─────────────────────────────────────────────────────────────

  async function approve() {
    if (!pending || processing) return;
    processing = true;
    try {
      const result = await confirmExecution(pending.id, true);
      // Append the command result as a system message in chat
      conversation.appendMessage({
        role: 'assistant',
        content: result.output,
      });
      dispatch('resolve', { id: pending.id, approved: true });
    } catch (err) {
      conversation.appendMessage({
        role: 'assistant',
        content: `⚠️ Command execution failed: ${err}`,
      });
    } finally {
      processing = false;
    }
  }

  async function deny() {
    if (!pending || processing) return;
    processing = true;
    try {
      await confirmExecution(pending.id, false);
      dispatch('resolve', { id: pending.id, approved: false });
    } catch (_) {
      // Ignore errors on denial
    } finally {
      processing = false;
    }
  }

  function alwaysAllow() {
    if (!pending) return;
    dispatch('alwaysAllow', { id: pending.id, commandName: pending.command });
    // Also approve this instance
    approve();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && pending) {
      deny();
    }
  }

  // ── Risk helpers ────────────────────────────────────────────────────────

  function riskLabel(risk: string): string {
    switch (risk) {
      case 'Medium': return 'Medium Risk';
      case 'Dangerous': return '⚠ Dangerous';
      default: return risk;
    }
  }

  function riskClass(risk: string): string {
    switch (risk) {
      case 'Medium': return 'risk-medium';
      case 'Dangerous': return 'risk-dangerous';
      default: return 'risk-safe';
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if pending}
  <!-- Overlay -->
  <div
    class="dialog-overlay"
    on:click|self={deny}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === 'Escape' && deny()}
    in:fly={{ y: 20, duration: 150 }}
    out:fly={{ y: 20, duration: 100 }}
  >
    <!-- Dialog -->
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      class:dangerous={pending.risk === 'Dangerous'}
      in:scale={{ start: 0.95, duration: 150 }}
      out:scale={{ start: 0.95, duration: 100 }}
    >
      <!-- Header -->
      <div class="dialog-header">
        <h2 id="dialog-title">Confirm Command</h2>
        <span class="risk-badge {riskClass(pending.risk)}">{riskLabel(pending.risk)}</span>
      </div>

      <!-- Command info -->
      <div class="dialog-body">
        <div class="info-row">
          <span class="info-label">Command</span>
          <span class="info-value">{pending.command}</span>
        </div>

        {#if pending.confirm_message}
          <div class="confirm-message">{pending.confirm_message}</div>
        {/if}

        <!-- Parameters -->
        {#if Object.keys(pending.params).length > 0}
          <div class="params-section">
            <span class="info-label">Parameters</span>
            <div class="params-list">
              {#each Object.entries(pending.params) as [key, value]}
                <div class="param-row">
                  <code class="param-key">{key}</code>
                  <code class="param-value">{value}</code>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Preview -->
        <div class="preview-section">
          <div class="preview-header">
            <span class="info-label">Preview</span>
            {#if pending.risk === 'Dangerous'}
              <button
                class="expand-btn"
                on:click={() => (showFullPreview = !showFullPreview)}
              >
                {showFullPreview ? 'Show less' : 'Show full command'}
              </button>
            {/if}
          </div>
          <div class="preview-content" class:full={showFullPreview}>
            {@html pending.preview}
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="dialog-footer">
        <button class="btn btn-secondary" on:click={deny} disabled={processing}>
          {processing ? 'Processing...' : 'Deny'}
        </button>
        {#if pending.risk === 'Dangerous'}
          <button class="btn btn-warning" on:click={alwaysAllow} disabled={processing}>
            Always allow this command
          </button>
        {/if}
        <button class="btn btn-primary" on:click={approve} disabled={processing}>
          {processing ? 'Executing...' : 'Approve'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-dialog);
    backdrop-filter: blur(2px);
  }

  .dialog {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    max-width: 520px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .dialog.dangerous {
    border-color: var(--color-danger);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-lg) var(--space-lg) 0;
  }

  .dialog-header h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0;
  }

  .risk-badge {
    font-size: var(--font-size-xs);
    font-weight: 700;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .risk-medium {
    background: var(--color-warning-bg);
    color: var(--color-warning);
  }

  .risk-dangerous {
    background: var(--color-danger-bg);
    color: var(--color-danger);
  }

  .risk-safe {
    background: rgba(0, 212, 170, 0.15);
    color: var(--color-success);
  }

  .dialog-body {
    padding: var(--space-lg);
  }

  .info-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
  }

  .info-label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted);
  }

  .info-value {
    font-size: var(--font-size-md);
    font-weight: 500;
  }

  .confirm-message {
    padding: var(--space-sm) var(--space-md);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
    font-style: italic;
    color: var(--color-text-secondary);
  }

  .params-section {
    margin-bottom: var(--space-md);
  }

  .params-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }

  .param-row {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }

  .param-key {
    background: var(--color-bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    min-width: 80px;
  }

  .param-value {
    background: var(--color-bg);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .preview-section {
    margin-bottom: 0;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-xs);
  }

  .expand-btn {
    background: none;
    border: none;
    color: var(--color-primary);
    cursor: pointer;
    font-size: var(--font-size-xs);
    padding: 0;
  }

  .expand-btn:hover {
    text-decoration: underline;
  }

  .preview-content {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    max-height: 120px;
    overflow: hidden;
    font-size: var(--font-size-sm);
    font-family: var(--font-mono);
  }

  .preview-content :global(pre) {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .preview-content :global(code) {
    font-family: var(--font-mono);
  }

  .preview-content.full {
    max-height: 400px;
    overflow-y: auto;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    padding: 0 var(--space-lg) var(--space-lg);
  }

  .btn {
    padding: var(--space-sm) var(--space-lg);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: 500;
    transition: all var(--transition-fast);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--color-primary);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-secondary {
    background: var(--color-surface-hover);
    color: var(--color-text);
    border-color: var(--color-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-bg-tertiary);
  }

  .btn-warning {
    background: transparent;
    color: var(--color-warning);
    border-color: var(--color-warning);
  }

  .btn-warning:hover:not(:disabled) {
    background: var(--color-warning-bg);
  }
</style>
