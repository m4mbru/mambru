<script lang="ts">
  import { hudState, expandPanel, collapsePanel } from '../stores/hud';
  import type { PanelId } from '../stores/hud';

  export let id: PanelId = null;
  export let title: string = '';
  export let x: number = 0;
  export let y: number = 0;
  export let width: number = 220;
  export let height: number = 0;
  export let accentColor: string = '#00BCD4';
  export let floatDelay: number = 0;
  export let miniContent: boolean = false;

  // ─── Drag state ─────────────────────────────────────────────────────
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;
  // Expanded-drag state
  let expDragX = 0;
  let expDragY = 0;
  let isExpDrag = false;
  let expDragStartX = 0;
  let expDragStartY = 0;
  let expOrigX = 0;
  let expOrigY = 0;

  $: isActive = ($hudState.mode === 'expanded' || $hudState.mode === 'expanding') && $hudState.activePanel === id;

  // Collapsed: orbital position + drag offset. Expanded: centered + exp drag offset
  $: collapsedStyle = `left:${x + dragOffsetX}px;top:${y + dragOffsetY}px;width:${width}px;${height ? `height:${height}px;` : ''}--accent:${accentColor};--float-delay:${floatDelay}s;`;
  $: expandedStyle = `position:fixed;top:calc(50% + ${expDragY}px);left:calc(50% + ${expDragX}px);z-index:100;width:min(60vw,520px);max-height:75vh;`;

  $: bodyStyle = height ? `max-height:${height - 50}px;overflow-y:auto` : '';

  // ─── Collapsed card drag ────────────────────────────────────────────
  function handleMouseDown(e: MouseEvent) {
    if (isActive) return; // expanded panels use header drag
    if ((e.target as HTMLElement).closest('.close-btn, button, input, select, textarea')) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginX = dragOffsetX;
    dragOriginY = dragOffsetY;
  }

  // ─── Expanded panel header drag ─────────────────────────────────────
  function handleHeaderMouseDown(e: MouseEvent) {
    if (!isActive) return;
    if ((e.target as HTMLElement).closest('.close-btn, button, input, select, textarea')) return;
    e.preventDefault();
    isExpDrag = true;
    expDragStartX = e.clientX;
    expDragStartY = e.clientY;
    expOrigX = expDragX;
    expOrigY = expDragY;
  }

  function handleGlobalMouseMove(e: MouseEvent) {
    if (isDragging) {
      dragOffsetX = dragOriginX + (e.clientX - dragStartX);
      dragOffsetY = dragOriginY + (e.clientY - dragStartY);
    }
    if (isExpDrag) {
      expDragX = expOrigX + (e.clientX - expDragStartX);
      expDragY = expOrigY + (e.clientY - expDragStartY);
    }
  }

  function handleGlobalMouseUp() {
    isDragging = false;
    isExpDrag = false;
  }

  function handleClick(e?: MouseEvent) {
    if (isDragging || isExpDrag) return;
    if (!id) return;
    // If event provided (mouse click), don't toggle when clicking interactive elements inside an expanded panel
    if (e && isActive && (e.target as HTMLElement).closest('button, input, select, textarea, a, [role="tab"], [role="switch"], label')) return;
    expandPanel(id);
  }

  function handleClose(e: MouseEvent) {
    e.stopPropagation();
    collapsePanel();
  }
</script>

<svelte:window on:mousemove={handleGlobalMouseMove} on:mouseup={handleGlobalMouseUp} />

<div
  class="floating-card"
  class:expanded={isActive}
  class:dragging={isDragging}
  style={isActive ? expandedStyle : collapsedStyle}
  on:mousedown={handleMouseDown}
  on:click={handleClick}
  role={isActive ? 'dialog' : 'button'}
  tabindex="-1"
  on:keydown={(e) => e.key === 'Enter' && !isActive && handleClick()}
>
  <div class="card-glow"></div>
  <div class="card-border"></div>
  <div class="card-scanlines"></div>

  {#if isActive}
    <div class="expanded-inner">
      <div class="card-header drag-handle" on:mousedown={handleHeaderMouseDown} role="button" tabindex="0" on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && e.preventDefault()}>
        <div class="card-led" style="background: {accentColor}"></div>
        <span class="card-title">{title}</span>
        <button class="close-btn" on:click={handleClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div class="card-body expanded-body">
        <slot />
      </div>
    </div>
  {:else}
    {#if title}
      <div class="card-header">
        <div class="card-led" style="background: {accentColor}"></div>
        <span class="card-title">{title}</span>
      </div>
    {/if}
    {#if miniContent}
      <div class="card-body" style={bodyStyle}>
        <slot />
      </div>
    {/if}
  {/if}
</div>

<style>
  .floating-card {
    position: fixed;
    z-index: 20;
    background: var(--window-bg);
    border-radius: 10px;
    padding: 0;
    color: var(--window-text, #ffffff);
    font-family: 'Segoe UI', system-ui, sans-serif;
    overflow: hidden;
    pointer-events: auto;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(0, 188, 212, 0.2);
    box-shadow:
      0 0 30px rgba(0, 188, 212, 0.08),
      inset 0 0 60px rgba(0, 188, 212, 0.02);
    cursor: grab;
    animation: floatIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) both,
               floatLoop 4s ease-in-out var(--float-delay) infinite;
    user-select: none;
  }

  .floating-card.dragging {
    cursor: grabbing;
    z-index: 50;
    animation: none;
    transform: scale(1.03);
    box-shadow:
      0 0 50px rgba(0, 188, 212, 0.2),
      inset 0 0 60px rgba(0, 188, 212, 0.04);
  }

  .floating-card:hover:not(.dragging):not(.expanded) {
    box-shadow:
      0 0 40px rgba(0, 188, 212, 0.15),
      inset 0 0 60px rgba(0, 188, 212, 0.04);
    transform: scale(1.02);
  }

  .drag-handle {
    cursor: grab;
  }
  .drag-handle:active {
    cursor: grabbing;
  }

  /* ─── Expanded state ─────────────────────────────────────────── */
  .floating-card.expanded {
    animation: expandIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;
    transform: translate(-50%, -50%) scale(1);
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 100;
    width: min(60vw, 520px);
    max-height: 75vh;
    background: var(--window-bg-expanded);
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(0, 188, 212, 0.3);
    box-shadow:
      0 0 60px rgba(0, 188, 212, 0.15),
      inset 0 0 60px rgba(0, 188, 212, 0.03);
    cursor: default;
    pointer-events: auto;
  }

  .floating-card.expanded:hover {
    box-shadow:
      0 0 60px rgba(0, 188, 212, 0.15),
      inset 0 0 60px rgba(0, 188, 212, 0.03);
    transform: none;
  }

  .floating-card.expanded .card-glow {
    border-radius: 17px;
  }
  .floating-card.expanded .card-border {
    border-radius: 15px;
  }
  .floating-card.expanded .card-scanlines {
    border-radius: 15px;
  }

  .expanded-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
  }

  .expanded-body {
    max-height: calc(75vh - 48px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 20px 24px 28px;
    font-size: 13px;
  }

  /* ─── Glow ──────────────────────────────────────────────────── */
  .card-glow {
    position: absolute;
    inset: -1px;
    border-radius: 13px;
    background: conic-gradient(
      from 0deg,
      transparent,
      var(--accent),
      transparent 30%,
      transparent 70%,
      var(--accent),
      transparent
    );
    opacity: 0.3;
    animation: glowRotate 4s linear infinite;
    pointer-events: none;
    z-index: 0;
  }

  .card-border {
    position: absolute;
    inset: 1px;
    border-radius: 11px;
    background: var(--window-bg-expanded);
    z-index: 1;
    pointer-events: none;
  }

  .card-scanlines {
    position: absolute;
    inset: 1px;
    border-radius: 11px;
    z-index: 1;
    pointer-events: none;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 188, 212, 0.015) 2px,
      rgba(0, 188, 212, 0.015) 4px
    );
  }

  /* ─── Header ────────────────────────────────────────────────── */
  .card-header {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px 8px;
    border-bottom: 1px solid rgba(0, 188, 212, 0.1);
  }

  .card-led {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    box-shadow: 0 0 8px currentColor;
    animation: ledPulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }

  .card-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 2px;
    text-shadow: 0 0 20px rgba(0, 188, 212, 0.3);
    flex: 1;
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
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: rgba(0, 188, 212, 0.15);
    border-color: rgba(0, 188, 212, 0.6);
  }

  /* ─── Body ──────────────────────────────────────────────────── */
  .card-body {
    position: relative;
    z-index: 2;
    padding: 8px 14px 12px;
    font-size: 11px;
    line-height: 1.6;
  }

  /* ─── Animations ────────────────────────────────────────────── */
  @keyframes floatIn {
    from { opacity: 0; transform: translateY(20px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes floatLoop {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-6px); }
  }

  @keyframes expandIn {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }

  @keyframes glowRotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  @keyframes ledPulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.4; }
  }
</style>
