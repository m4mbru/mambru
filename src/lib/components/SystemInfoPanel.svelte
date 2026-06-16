<script lang="ts">
  import { onMount } from 'svelte';
  import { settings } from '../stores/settings';
  import MiniGraph from './MiniGraph.svelte';

  let os = '';
  let cores = 0;
  let ram = '—';
  let displayRes = '';
  let uptime = '';
  let browser = '';
  let heapUsed = '';
  let heapTotal = '';

  $: provider = $settings.provider.active;
  $: model = provider === 'ollama'
    ? $settings.provider.ollama.model
    : provider === 'openai'
      ? $settings.provider.openai.model
      : provider === 'anthropic'
        ? $settings.provider.anthropic.model
        : '';

  let tick = 0;

  onMount(() => {
    os = navigator.platform;
    cores = navigator.hardwareConcurrency || 0;
    // @ts-ignore — navigator.deviceMemory is Chrome-only
    if (navigator.deviceMemory) ram = `${navigator.deviceMemory} GB`;
    displayRes = `${screen.width} × ${screen.height}`;
    browser = navigator.userAgent.replace(/.*?(Chrome|Firefox|Safari|Edge)\/(\S+).*/s, '$1 $2');

    // Formatting
    if (browser === navigator.userAgent) {
      // fallback: grab first meaningful token
      browser = navigator.userAgent.split('/')[0];
    }

    const start = Date.now();
    setInterval(() => {
      tick = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(tick / 3600);
      const m = Math.floor((tick % 3600) / 60);
      const s = tick % 60;
      uptime = `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;

      // performance.memory is not available in all browsers; guard and use any to satisfy TS
      if ((performance as any).memory) {
        const mem = (performance as any).memory;
        heapUsed = (mem.usedJSHeapSize / 1024 / 1024).toFixed(0) + ' MB';
        heapTotal = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0) + ' MB';
      }
    }, 1000);
  });
</script>

<div class="sys-panel">
  <!-- Row: OS + Cores + RAM -->
  <div class="stat-grid">
    <div class="stat">
      <MiniGraph color="#00BCD4" speed={0.6} amplitude={0.3} />
      <div class="stat-label">OS</div>
      <div class="stat-value">{os}</div>
    </div>
    <div class="stat">
      <MiniGraph color="#4DD0E1" speed={0.9} amplitude={0.35} />
      <div class="stat-label">Cores</div>
      <div class="stat-value">{cores}</div>
    </div>
    <div class="stat">
      <MiniGraph color="#26C6DA" speed={0.7} amplitude={0.25} />
      <div class="stat-label">RAM</div>
      <div class="stat-value">{ram}</div>
    </div>
  </div>

  <!-- Row: Display + Uptime + Heap -->
  <div class="stat-grid">
    <div class="stat">
      <MiniGraph color="#00BCD4" speed={0.5} amplitude={0.3} />
      <div class="stat-label">Display</div>
      <div class="stat-value">{displayRes}</div>
    </div>
    <div class="stat">
      <MiniGraph color="#4DD0E1" speed={1.0} amplitude={0.4} />
      <div class="stat-label">Uptime</div>
      <div class="stat-value">{uptime || '—'}</div>
    </div>
    <div class="stat">
      <MiniGraph color="#26C6DA" speed={0.8} amplitude={0.3} />
      <div class="stat-label">Heap</div>
      <div class="stat-value">{heapUsed || '—'}</div>
    </div>
  </div>

  <!-- Bar: CPU Cores visual -->
  <div class="bar-section">
    <MiniGraph color="#00BCD4" speed={0.4} amplitude={0.2} />
    <div class="bar-label">
      <span>LOGICAL PROCESSORS</span>
      <span>{cores}</span>
    </div>
    <div class="bar-track">
      <div class="bar-fill cores-bar" style="width: {Math.min(100, cores * 10)}%"></div>
    </div>
  </div>

  <!-- Bar: RAM usage (if available via performance.memory) -->
  {#if heapTotal}
    {@const pct = Math.min(100, Math.round((parseInt(heapUsed) / parseInt(heapTotal)) * 100))}
    <div class="bar-section">
      <MiniGraph color="#4CAF50" speed={0.6} amplitude={0.25} />
      <div class="bar-label">
        <span>HEAP USAGE</span>
        <span>{heapUsed} / {heapTotal}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill heap-bar" style="width: {pct}%"></div>
      </div>
    </div>
  {/if}

  <!-- AI Model -->
  <div class="stat-grid" style="margin-top: 8px">
    <div class="stat" style="grid-column: 1 / -1">
      <MiniGraph color="#00BCD4" speed={0.35} amplitude={0.2} />
      <div class="stat-label">AI Model</div>
      <div class="stat-value" style="color: #00BCD4">{model || 'Not configured'}</div>
    </div>
  </div>
</div>

<style>
  .sys-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }

  .stat {
    position: relative;
    background: rgba(0, 188, 212, 0.04);
    border: 1px solid rgba(0, 188, 212, 0.12);
    border-radius: 8px;
    padding: 8px 10px;
    overflow: hidden;
  }

  .stat-label {
    position: relative;
    z-index: 1;
    font-size: 9px;
    font-weight: 700;
    color: rgba(0, 188, 212, 0.6);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .stat-value {
    position: relative;
    z-index: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text);
    font-family: 'Consolas', 'Courier New', monospace;
    letter-spacing: 0.3px;
    word-break: break-all;
  }

  .bar-section {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
  }

  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    font-weight: 700;
    color: rgba(0, 188, 212, 0.6);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .bar-track {
    height: 6px;
    background: rgba(0, 188, 212, 0.08);
    border-radius: 3px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 1s ease;
  }

  .cores-bar {
    background: linear-gradient(90deg, #00BCD4, #4DD0E1);
    box-shadow: 0 0 8px rgba(0, 188, 212, 0.3);
  }

  .heap-bar {
    background: linear-gradient(90deg, #4CAF50, #8BC34A);
    box-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
  }
</style>
