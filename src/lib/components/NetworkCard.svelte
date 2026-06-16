<script lang="ts">
  import { settings } from '../stores/settings';
  import { onMount, onDestroy } from 'svelte';

  $: provider = $settings.provider.active;
  $: endpoint = provider === 'ollama'
    ? $settings.provider.ollama
    : provider === 'openai'
      ? $settings.provider.openai
      : $settings.provider.anthropic;

  let latency: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    timer = setInterval(() => {
      // Simulated ping — real impl would call backend
      latency = Math.floor(20 + Math.random() * 80);
    }, 3000);
    latency = Math.floor(20 + Math.random() * 80);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<div class="network-card">
  <div class="net-row">
    <span class="net-label">Provider</span>
    <span class="net-value">{provider || '—'}</span>
  </div>
  <div class="net-row">
    <span class="net-label">Model</span>
    <span class="net-value mono">{endpoint?.model || '—'}</span>
  </div>
  <div class="net-row">
    <span class="net-label">Status</span>
    <span class="net-value status" class:online={!!provider}>
      <span class="status-dot" class:online={!!provider}></span>
      {provider ? 'Connected' : 'Offline'}
    </span>
  </div>
  <div class="net-row">
    <span class="net-label">Latency</span>
    <span class="net-value mono">
      {latency !== null ? `${latency}ms` : '—'}
    </span>
  </div>
</div>

<style>
  .network-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .net-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .net-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: rgba(0, 188, 212, 0.6);
  }

  .net-value {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .net-value.mono {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 11px;
  }

  .net-value.status {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ff5252;
    box-shadow: 0 0 6px #ff5252;
  }

  .status-dot.online {
    background: #00E676;
    box-shadow: 0 0 6px #00E676;
    animation: dotPulse 2s ease-in-out infinite;
  }

  .net-value.online {
    color: #00E676;
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
