<script lang="ts">
  import { fly, scale } from 'svelte/transition';
  import { modelStates, isDownloading, downloadModel, allReady } from '../stores/models';
  import type { ModelKind } from '../api/models';

  // ── Props ───────────────────────────────────────────────────────────────

  export let show: boolean;
  export let onSkip: () => void;

  // ── State ───────────────────────────────────────────────────────────────

  let closing = false;

  // ── Derived ─────────────────────────────────────────────────────────────

  $: missingModels = Object.values($modelStates).filter((m) => m.status === 'missing');
  $: failedModels = Object.values($modelStates).filter((m) => m.status === 'failed');
  $: downloadingModels = Object.values($modelStates).filter((m) => m.status === 'downloading');
  $: shouldAutoClose = $allReady;

  // ── Auto-close ──────────────────────────────────────────────────────────

  $: if (shouldAutoClose && show) {
    close();
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  async function handleDownloadAll() {
    for (const model of missingModels) {
      await downloadModel(model.kind as ModelKind);
      // If the user skipped (closed dialog), stop the chain
      if (closing) break;
    }
  }

  async function handleDownloadOne(kind: ModelKind) {
    await downloadModel(kind);
  }

  function close() {
    closing = true;
    onSkip();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && show) {
      close();
    }
  }

  // ── Formatting ──────────────────────────────────────────────────────────

  function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined || bytes === 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function modelLabel(kind: string): string {
    return kind === 'Whisper' ? 'Speech Recognition (Whisper)' : 'Voice Synthesis (Piper)';
  }

  function progressPercent(state: { bytes?: number; total?: number }): number {
    if (!state.total || state.total === 0) return 0;
    return Math.min(100, Math.round(((state.bytes ?? 0) / state.total) * 100));
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show && !closing}
  <!-- Overlay -->
  <div
    class="dialog-overlay"
    on:click|self={close}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === 'Escape' && close()}
    in:fly={{ y: 20, duration: 150 }}
    out:fly={{ y: 20, duration: 100 }}
  >
    <!-- Dialog -->
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-dialog-title"
      in:scale={{ start: 0.95, duration: 150 }}
      out:scale={{ start: 0.95, duration: 100 }}
    >
      <!-- Header -->
      <div class="dialog-header">
        <h2 id="download-dialog-title">Voice Models Required</h2>
        <p class="dialog-subtitle">
          Mambru needs to download voice recognition and synthesis models to enable voice features.
        </p>
      </div>

      <!-- Body -->
      <div class="dialog-body">
        {#if $isDownloading || downloadingModels.length > 0}
          <!-- Downloading state -->
          {#each Object.values($modelStates) as state}
            {#if state.status === 'downloading'}
              <div class="model-item">
                <div class="model-info">
                  <span class="model-name">{modelLabel(state.kind)}</span>
                  <span class="model-size">
                    {formatBytes(state.bytes)} / {formatBytes(state.total)}
                  </span>
                </div>
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    style="width: {progressPercent(state)}%"
                  ></div>
                </div>
                <span class="progress-text">{progressPercent(state)}%</span>
              </div>
            {/if}
          {/each}
        {:else if failedModels.length > 0}
          <!-- Failed state -->
          {#each failedModels as model}
            <div class="model-item failed">
              <div class="model-info">
                <span class="model-name">{modelLabel(model.kind)}</span>
                <span class="model-error">
                  {model.error || 'Download failed'}
                </span>
              </div>
              <button
                class="retry-btn"
                on:click={() => handleDownloadOne(model.kind)}
              >
                Retry
              </button>
            </div>
          {/each}
          {#if missingModels.length > 0}
            <div class="missing-remaining">
              {missingModels.length} model{missingModels.length !== 1 ? 's' : ''} remaining
            </div>
          {/if}
        {:else if missingModels.length > 0}
          <!-- Initial / missing state -->
          {#each missingModels as model}
            <div class="model-item">
              <div class="model-info">
                <span class="model-name">{modelLabel(model.kind)}</span>
                <span class="model-size">~{model.kind === 'Whisper' ? '150' : '80'} MB</span>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Footer -->
      <div class="dialog-footer">
        <button class="btn btn-secondary" on:click={close} disabled={$isDownloading}>
          {#if $allReady}
            Close
          {:else if $isDownloading}
            Downloading...
          {:else}
            Skip
          {/if}
        </button>

        {#if !$isDownloading && missingModels.length > 0}
          <button class="btn btn-primary" on:click={handleDownloadAll}>
            Download All ({missingModels.length} model{missingModels.length !== 1 ? 's' : ''})
          </button>
        {/if}
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
    max-width: 480px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  }

  .dialog-header {
    padding: var(--space-lg) var(--space-lg) 0;
  }

  .dialog-header h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0 0 var(--space-xs);
  }

  .dialog-subtitle {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--space-sm);
    line-height: 1.4;
  }

  .dialog-body {
    padding: var(--space-lg);
  }

  .model-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-sm);
  }

  .model-item:last-child {
    margin-bottom: 0;
  }

  .model-item.failed {
    border-color: var(--color-danger);
    background: var(--color-danger-bg);
  }

  .model-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .model-name {
    font-size: var(--font-size-sm);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .model-size {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .model-error {
    font-size: var(--font-size-xs);
    color: var(--color-danger);
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    overflow: hidden;
    min-width: 80px;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: var(--radius-full);
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-secondary);
    min-width: 36px;
    text-align: right;
  }

  .retry-btn {
    padding: var(--space-xs) var(--space-md);
    background: var(--color-danger);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: var(--font-size-xs);
    font-weight: 500;
    font-family: var(--font-sans);
    flex-shrink: 0;
  }

  .retry-btn:hover {
    opacity: 0.9;
  }

  .missing-remaining {
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
    margin-top: var(--space-sm);
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
    font-family: var(--font-sans);
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
</style>
