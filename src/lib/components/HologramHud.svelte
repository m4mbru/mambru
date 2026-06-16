<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { HologramEngine, NeuralNetwork } from '../hologram';
  import { settings } from '../stores/settings';
  import ChatPanel from './ChatPanel.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import SystemInfoPanel from './SystemInfoPanel.svelte';
  import ComandosPanel from './ComandosPanel.svelte';
  import FloatingCard from './FloatingCard.svelte';
  import ClockCard from './ClockCard.svelte';
  import TerminalCard from './TerminalCard.svelte';
  import HudControls from './HudControls.svelte';

  // Map STL model IDs to model configs
  const stlModels: Record<string, { path: string; clipBottomY?: number }> = {
    'stl:busto-humano': { path: '/models/busto-humano.stl' },
    'stl:modelo-jhon': { path: '/models/modelo-jhon.stl', clipBottomY: -0.3 },
    'stl:modelo-sofia': { path: '/models/modelo-sofia.stl', clipBottomY: -0.3 },
    'stl:modelo-sefira-elfa': { path: '/models/modelo-sefira-elfa.stl', clipBottomY: -0.3 },
  };

  const CARD_W = 170;

  const cards = [
    { id: 'clock' as const, title: 'Clock', component: ClockCard, showContent: true },
    { id: 'terminal' as const, title: 'Terminal', component: TerminalCard },
    { id: 'chat' as const, title: 'Chat', component: ChatPanel },
    { id: 'comandos' as const, title: 'Comandos', component: ComandosPanel },
    { id: 'system' as const, title: 'System', component: SystemInfoPanel },
    { id: 'settings' as const, title: 'Settings', component: SettingsPanel },
  ];

  let ww = typeof window !== 'undefined' ? window.innerWidth : 1920;
  let wh = typeof window !== 'undefined' ? window.innerHeight : 1080;

  $: centerX = ww / 2;
  $: centerY = wh / 2;
  // Distance from center to card center — outside the outer ring
  $: ringRadius = Math.min(ww, wh) * 0.32;
  $: cardDist = ringRadius + 20;

  // Per-card position adjustments
  const cardMeta = [
    { angle: -Math.PI / 2, distMult: 1.08 },   // clock — top
    { angle: -Math.PI / 6, distMult: 1 },       // terminal — upper-right
    { angle: Math.PI / 6, distMult: 1 },         // chat — lower-right
    { angle: Math.PI / 2, distMult: 0.88 },     // comandos — bottom
    { angle: (5 * Math.PI) / 6, distMult: 1 },   // system — lower-left
    { angle: (-5 * Math.PI) / 6, distMult: 1 },  // settings — upper-left
  ];

  function cardPos(index: number) {
    const m = cardMeta[index];
    const d = cardDist * m.distMult;
    return {
      x: centerX + Math.cos(m.angle) * d - CARD_W / 2,
      y: centerY + Math.sin(m.angle) * d,
    };
  }

  let canvas: HTMLCanvasElement;
  let engine: HologramEngine | null = null;
  let network: NeuralNetwork | null = null;

  onMount(async () => {
    if (!canvas) return;

    engine = new HologramEngine(canvas, {
      morphSpeed: 0.03,
      onUpdate: (delta, elapsed) => network?.update(delta, elapsed),
    });
    await engine.init();

    const scene = engine.getScene();
    if (scene) {
      network = new NeuralNetwork(scene);
      await network.init();

      // Apply initial hologram style
      const initStyle = $settings.hologram.style;
      applyStyle(initStyle);
    }

    ww = window.innerWidth;
    wh = window.innerHeight;
    const onResize = () => {
      ww = window.innerWidth;
      wh = window.innerHeight;
    };
    window.addEventListener('resize', onResize);
  });

  // Reactively apply style changes
  $: {
    const style = $settings.hologram.style;
    if (style && engine && network) {
      applyStyle(style);
    }
  }

  function applyStyle(style: string) {
    if (!engine || !network) return;
    if (style.startsWith('stl:')) {
      // STL model selected — hide particles, show 3D bust
      engine.setParticlesVisible(false);
      const cfg = stlModels[style];
      if (cfg) network.setModel(cfg.path, cfg.clipBottomY);
    } else {
      // Particle style selected — show particles, hide STL
      network.clearModel();
      engine.setParticlesVisible(true);
      engine.setStyle(style as any);
    }
  }

  onDestroy(() => {
    network?.dispose();
    engine?.destroy();
  });
</script>

<div class="hud-container">
  <canvas bind:this={canvas} class="holo-canvas"></canvas>

  <!-- Radial cards around the central figure -->
  {#each cards as card, i (card.id)}
    {@const pos = cardPos(i)}
    <FloatingCard
      id={card.id}
      title={card.title}
      x={pos.x}
      y={pos.y}
      width={CARD_W}
      floatDelay={i * 0.12}
      miniContent={card.showContent ?? card.id === 'terminal'}
    >
      <svelte:component this={card.component} />
    </FloatingCard>
  {/each}

  <HudControls />
</div>

<style>
  .hud-container {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #1A1D31;
  }

  .holo-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
