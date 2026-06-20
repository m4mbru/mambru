<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { hologram, setEngineReady, type HologramStyle, type HologramEmotion, type HologramPosition } from '../stores/hologram';
  import type { HologramEngine } from '../hologram/HologramEngine';
  import type { ParticleStyle } from '../hologram/particles';
  import type { Emotion } from '../hologram/emotions';

  // ── Store subscriptions ───────────────────────────────────────────────

  let enabled = false;
  let style: HologramStyle = 'sphere';
  let size = 200;
  let position: HologramPosition = 'floating';
  let emotion: HologramEmotion = 'neutral';
  let emotionConfidence = 1.0;

  const unsubHologram = hologram.subscribe((s) => {
    enabled = s.enabled;
    style = s.style;
    size = s.size;
    position = s.position;
    emotion = s.emotion;
    emotionConfidence = s.emotionConfidence;
  });

  // ── Engine state ──────────────────────────────────────────────────────

  let canvasElement: HTMLCanvasElement;
  let engine: HologramEngine | null = null;

  // ── Engine lifecycle ──────────────────────────────────────────────────

  async function mountEngine(): Promise<void> {
    if (engine) return;
    if (!canvasElement) return;

    try {
      const { HologramEngine: Engine } = await import('../hologram/HologramEngine');
      engine = new Engine(canvasElement, {
        enableDance: true,
        enableAudioReactivity: true,
      });
      await engine.init();
      setEngineReady(true);

      // Apply current style
      engine.setStyle(style as ParticleStyle);

      // Apply current emotion (with low-confidence guard)
      engine.setEmotion(emotionConfidence < 0.6 ? 'neutral' : (emotion as Emotion));
    } catch (err) {
      console.error('[HologramWidget] Failed to mount engine:', err);
      setEngineReady(false);
    }
  }

  function destroyEngine(): void {
    if (!engine) return;
    engine.destroy();
    engine = null;
    setEngineReady(false);
  }

  // ── React to store changes ────────────────────────────────────────────

  // When enabled changes, mount or destroy engine
  $: if (enabled && !engine) {
    mountEngine();
  } else if (!enabled && engine) {
    destroyEngine();
  }

  // Forward store changes to engine
  $: if (engine && style) {
    engine.setStyle(style as ParticleStyle);
  }

  $: if (engine && emotion) {
    // R4: Low-confidence guard — remain neutral when confidence < 0.6
    const resolvedEmotion = emotionConfidence < 0.6 ? 'neutral' : emotion;
    engine.setEmotion(resolvedEmotion as Emotion);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  onDestroy(() => {
    unsubHologram();
    destroyEngine();
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
{#if enabled}
  <div
    class="hologram-widget visible position-{position}"
    style="width: {size}px; height: {size}px;"
    role="img"
    aria-label="Hologram avatar"
  >
    <canvas
      bind:this={canvasElement}
      id="holo-canvas"
      width={size}
      height={size}
    ></canvas>
  </div>
{/if}

<style>
  .hologram-widget {
    position: fixed;
    z-index: var(--holo-z, 25);
    pointer-events: none;
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 300ms ease, transform 300ms ease;
    will-change: opacity, transform;
  }

  .hologram-widget.visible {
    opacity: 1;
    transform: scale(1);
  }

  /* ── Position presets ──────────────────────────── */

  .position-floating {
    bottom: 120px;
    right: 24px;
  }

  .position-minimal {
    bottom: 80px;
    right: 8px;
  }

  .position-panel {
    top: 50%;
    right: 24px;
    transform: translateY(-50%) scale(0.8);
  }

  .position-panel.visible {
    transform: translateY(-50%) scale(1);
  }

  /* ── Canvas ────────────────────────────────────── */

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: var(--radius-lg);
  }
</style>
