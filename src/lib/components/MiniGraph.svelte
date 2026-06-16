<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let color = '#00BCD4';
  export let speed = 0.8;
  export let amplitude = 0.4;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let frameId = 0;
  let phase = 0;

  function draw(timestamp: number) {
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    phase += speed * 0.02;

    ctx.clearRect(0, 0, w, h);

    // Wave
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    for (let x = 0; x < w; x++) {
      const t = (x / w) * Math.PI * 2;
      const y = h / 2 + Math.sin(t + phase) * (h * amplitude);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.25;
    ctx.stroke();

    // Secondary wave (slightly offset, different frequency)
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    for (let x = 0; x < w; x++) {
      const t = (x / w) * Math.PI * 3;
      const y = h / 2 + Math.sin(t + phase * 0.7 + 1) * (h * amplitude * 0.6);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.15;
    ctx.stroke();

    // Scan line
    const scanX = ((phase * 20) % (w * 2));
    const sx = scanX < w ? scanX : w * 2 - scanX;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.stroke();

    ctx.globalAlpha = 1;
    frameId = requestAnimationFrame(draw);
  }

  onMount(() => {
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    // High-DPI
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx!.scale(devicePixelRatio, devicePixelRatio);
    frameId = requestAnimationFrame(draw);
  });

  onDestroy(() => {
    cancelAnimationFrame(frameId);
  });
</script>

<canvas bind:this={canvas} class="mini-graph" />

<style>
  .mini-graph {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    border-radius: 8px;
    z-index: 0;
  }
</style>
