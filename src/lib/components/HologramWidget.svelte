<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { hologram, setEngineReady, setHologramEmotion } from '../stores/hologram';
  import { settings } from '../stores/settings';
  import { listenForHoloEmotion } from '../api/voice';
  import { HologramEngine, type HologramEngineOptions } from '../hologram';

  // ── Props ───────────────────────────────────────────────────────────────

  export let engineOptions: HologramEngineOptions = {};

  // ── State ───────────────────────────────────────────────────────────────

  let canvas: HTMLCanvasElement;
  let engine: HologramEngine | null = null;
  let unlistenHolo: (() => void) | null = null;
  let unsubStore: (() => void) | null = null;

  // ── Derived ─────────────────────────────────────────────────────────────

  $: visible = $hologram.enabled && $settings.hologram.enabled;
  $: size = $hologram.size;

  // ── Lifecycle ───────────────────────────────────────────────────────────

  onMount(async () => {
    // Listen for emotion events from backend
    try {
      unlistenHolo = await listenForHoloEmotion((payload) => {
        setHologramEmotion(payload.emotion, payload.confidence);
      });
    } catch (_) {
      // Backend may not support this yet
    }

    // Init engine when component mounts (lazy Three.js load)
    if (canvas) {
      engine = new HologramEngine(canvas, engineOptions);
      await engine.init();
      setEngineReady(true);
    }

    // Store subscription: forward style/emotion/size changes to engine
    unsubStore = hologram.subscribe(($h) => {
      if (!engine) return;
      engine.setStyle($h.style);
      engine.setEmotion($h.emotion);
      if (canvas) {
        canvas.style.width = `${$h.size}px`;
        canvas.style.height = `${$h.size}px`;
      }
    });
  });

  onDestroy(() => {
    unlistenHolo?.();
    unsubStore?.();
    engine?.destroy();
    engine = null;
    setEngineReady(false);
  });
</script>

<div
  class="holo-widget"
  class:visible
  class:floating={$hologram.position === 'floating'}
  class:minimal={$hologram.position === 'minimal'}
  class:panel={$hologram.position === 'panel'}
  role="img"
  aria-label="Holographic avatar"
>
  <canvas
    bind:this={canvas}
    class="holo-canvas"
    style="width: {size}px; height: {size}px;"
  ></canvas>
</div>

<style>
  .holo-widget {
    position: fixed;
    z-index: var(--z-holo, 50);
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--transition-normal, 0.3s ease);
  }

  .holo-widget.visible {
    opacity: 1;
  }

  .holo-widget.floating {
    bottom: 80px;
    right: 16px;
  }

  .holo-widget.minimal {
    bottom: 8px;
    right: 8px;
  }

  .holo-widget.floating .holo-canvas,
  .holo-widget.minimal .holo-canvas {
    filter: drop-shadow(0 0 12px var(--color-holo-glow, rgba(79, 195, 247, 0.4)));
  }

  .holo-canvas {
    display: block;
    aspect-ratio: 1;
  }
</style>
