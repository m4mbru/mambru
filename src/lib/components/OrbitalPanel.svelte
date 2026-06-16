<script lang="ts">
  import { expandPanel, collapsePanel } from '../stores/hud';
  import type { PanelId } from '../stores/hud';

  export let id: PanelId = null;
  export let position: 'top' | 'left' | 'right' | 'bottom' = 'top';
  export let label: string = '';
  export let icon: string = '';
  export let expanded: boolean = false;

  function handleClick() {
    if (expanded) {
      collapsePanel();
    } else {
      expandPanel(id);
    }
  }

  function handleClose(e: MouseEvent) {
    e.stopPropagation();
    collapsePanel();
  }
</script>

<div
  class="orbital-panel"
  class:expanded
  class:orbital={!expanded}
  class:top={position === 'top' && !expanded}
  class:left={position === 'left' && !expanded}
  class:right={position === 'right' && !expanded}
  class:bottom={position === 'bottom' && !expanded}
  role="button"
  tabindex="0"
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
>
  {#if expanded}
    <div class="panel-content">
      <div class="panel-header">
        <span class="panel-label">{label}</span>
        <button class="close-btn" on:click={handleClose} aria-label="Close panel">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div class="panel-body">
        <slot />
      </div>
    </div>
  {:else}
    <div class="orbital-card">
      <div class="orbital-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d={icon} />
        </svg>
      </div>
      <span class="orbital-label">{label}</span>
    </div>
  {/if}
</div>

<style>
  .orbital-panel {
    position: fixed;
    z-index: 10;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .orbital-panel.orbital {
    pointer-events: auto;
  }

  .orbital-panel.orbital.top {
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
  }

  .orbital-panel.orbital.left {
    left: 20px;
    top: 50%;
    transform: translateY(-50%);
  }

  .orbital-panel.orbital.right {
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
  }

  .orbital-panel.orbital.bottom {
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
  }

  .orbital-panel.expanded {
    position: fixed;
    inset: 8vh 8vw;
    z-index: 100;
    cursor: default;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .orbital-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    background: var(--panel-bg);
    border: 1px solid rgba(0, 188, 212, 0.3);
    border-radius: 12px;
    backdrop-filter: blur(8px);
    box-shadow:
      0 0 15px rgba(0, 188, 212, 0.15),
      inset 0 0 15px rgba(0, 188, 212, 0.05);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    min-width: 80px;
  }

  .orbital-card:hover {
    border-color: rgba(0, 188, 212, 0.6);
    box-shadow:
      0 0 25px rgba(0, 188, 212, 0.3),
      inset 0 0 15px rgba(0, 188, 212, 0.08);
    transform: scale(1.05);
  }

  .orbital-icon {
    color: #00BCD4;
    opacity: 0.9;
  }

  .orbital-label {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: #00BCD4;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.8;
  }

  .panel-content {
    width: 100%;
    height: 100%;
    background: var(--panel-bg-expanded);
    border: 1px solid rgba(0, 188, 212, 0.4);
    border-radius: 16px;
    backdrop-filter: blur(12px);
    box-shadow:
      0 0 40px rgba(0, 188, 212, 0.2),
      inset 0 0 30px rgba(0, 188, 212, 0.05);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: expandIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes expandIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(0, 188, 212, 0.15);
  }

  .panel-label {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: #00BCD4;
    text-transform: uppercase;
    letter-spacing: 1.5px;
  }

  .close-btn {
    background: transparent;
    border: 1px solid rgba(0, 188, 212, 0.3);
    border-radius: 8px;
    color: #00BCD4;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: rgba(0, 188, 212, 0.15);
    border-color: rgba(0, 188, 212, 0.6);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    color: var(--color-text);
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
  }
</style>
