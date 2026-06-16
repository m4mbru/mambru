<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { hudState, collapsePanel, expandPanel, PANEL_ORDER } from '../stores/hud';

  $: isExpanded = $hudState.mode === 'expanded' || $hudState.mode === 'expanding';

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      collapsePanel();
      return;
    }
    if (e.key === 'Tab') {
      const active = $hudState.activePanel;
      if (!active) {
        expandPanel(PANEL_ORDER[0]);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const idx = PANEL_ORDER.indexOf(active);
      const next = idx >= 0 ? PANEL_ORDER[(idx + 1) % PANEL_ORDER.length] : PANEL_ORDER[0];
      expandPanel(next);
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if isExpanded}
  <button
    class="close-btn"
    on:click={collapsePanel}
    aria-label="Close panel"
    title="Close (Esc)"
  >
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </button>
{/if}

<style>
  .close-btn {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 200;
    background: var(--hud-bg);
    border: 1px solid rgba(0, 188, 212, 0.4);
    border-radius: 10px;
    color: #00BCD4;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    transition: all 0.2s ease;
    box-shadow: 0 0 20px rgba(0, 188, 212, 0.2);
  }

  .close-btn:hover {
    background: rgba(0, 188, 212, 0.2);
    border-color: rgba(0, 188, 212, 0.7);
    box-shadow: 0 0 30px rgba(0, 188, 212, 0.3);
  }
</style>
