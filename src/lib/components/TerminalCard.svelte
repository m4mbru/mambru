<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const MAX_LINES = 8;

  let lines: string[] = [
    '[BOOT]  Mambru v2.0 — system init',
    '[BOOT]  Hologram engine: loaded',
    '[BOOT]  Neural network: synchronised',
    '[INFO]  All systems nominal',
  ];
  let timer: ReturnType<typeof setInterval> | null = null;

  const messages = [
    '[SYS]  Memory: 64.2 MB / 256 MB',
    '[SYS]  FPS: stable at 60',
    '[NET]  Heartbeat OK — 34ms',
    '[HOLO] Render pass complete',
    '[SYS]  Particle count: 6000',
    '[NET]  Model cache: warm',
    '[HOLO] Neural pulse: nominal',
    '[SYS]  Frame time: 14.2ms',
    '[NET]  API latency: 42ms',
    '[HOLO] Glow pass: complete',
  ];
  let idx = 0;

  onMount(() => {
    timer = setInterval(() => {
      lines = [...lines.slice(-(MAX_LINES - 1)), messages[idx % messages.length]];
      idx++;
    }, 4000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<div class="terminal">
  {#each lines as line, i}
    <div class="term-line" class:fade={i < lines.length - 1}>
      <span class="term-prompt">></span>
      {line}
    </div>
  {/each}
</div>

<style>
  .terminal {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 10px;
    line-height: 1.8;
    color: #00BCD4;
    min-height: 120px;
  }

  .term-line {
    opacity: 0.9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .term-line:last-child {
    opacity: 1;
    animation: blinkIn 0.3s ease;
  }

  .term-line.fade {
    opacity: 0.5;
  }

  .term-prompt {
    color: #00E676;
    margin-right: 8px;
    font-weight: 700;
  }

  @keyframes blinkIn {
    from {
      opacity: 0;
      transform: translateX(-4px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
