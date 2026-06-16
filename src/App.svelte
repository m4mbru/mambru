<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { settings } from './lib/stores/settings';
  import { conversation } from './lib/stores/conversation';
  import { hasMissing, init as initModels, destroy as destroyModels } from './lib/stores/models';
  import HologramHud from './lib/components/HologramHud.svelte';
  import DownloadDialog from './lib/components/DownloadDialog.svelte';

  let showDownloadDialog = false;

  onMount(async () => {
    try {
      if (hasMissing($settings.models)) showDownloadDialog = true;
      await initModels();
    } catch (err) {
      console.error('Failed to init models', err);
    }
  });

  onDestroy(() => {
    destroyModels();
  });

  // ── Reactive appearance ──────────────────────────────────────────

  function applyTheme(theme: string) {
    const root = document.documentElement;
    const isLight = theme === 'light';
    root.dataset.theme = isLight ? 'light' : '';

    if (isLight) {
      root.style.setProperty('--color-text', '#2a2a3e');
      root.style.setProperty('--color-text-secondary', '#6a6a8a');
      root.style.setProperty('--color-text-muted', '#9a9ab0');
      root.style.setProperty('--color-bg', '#e8e8ee');
      root.style.setProperty('--color-bg-secondary', '#dddde5');
      root.style.setProperty('--color-surface', '#f0f0f6');
      root.style.setProperty('--window-bg', 'rgba(200, 200, 212, 0.5)');
      root.style.setProperty('--window-bg-expanded', 'rgba(210, 210, 222, 0.55)');
      root.style.setProperty('--window-text', '#000000');
    } else {
      root.style.setProperty('--color-text', '#e4e4f0');
      root.style.setProperty('--color-text-secondary', '#a0a0c0');
      root.style.setProperty('--color-text-muted', '#6e6e8a');
      root.style.setProperty('--color-bg', '#1a1a2e');
      root.style.setProperty('--color-bg-secondary', '#16213e');
      root.style.setProperty('--color-surface', '#1e1e3a');
      root.style.setProperty('--window-bg', 'rgba(10, 12, 28, 0.88)');
      root.style.setProperty('--window-bg-expanded', 'rgba(10, 12, 28, 0.96)');
      root.style.setProperty('--window-text', '#ffffff');
    }
  }

  function applyFontSize(size: string) {
    const root = document.documentElement;
    switch (size) {
      case 'small':
        root.style.setProperty('--font-size-xs', '10px');
        root.style.setProperty('--font-size-sm', '11px');
        root.style.setProperty('--font-size-md', '13px');
        root.style.setProperty('--font-size-lg', '15px');
        break;
      case 'large':
        root.style.setProperty('--font-size-xs', '12px');
        root.style.setProperty('--font-size-sm', '13px');
        root.style.setProperty('--font-size-md', '15px');
        root.style.setProperty('--font-size-lg', '17px');
        break;
      default: // medium
        root.style.setProperty('--font-size-xs', '11px');
        root.style.setProperty('--font-size-sm', '12px');
        root.style.setProperty('--font-size-md', '14px');
        root.style.setProperty('--font-size-lg', '16px');
        break;
    }
  }

  // React to store changes
  $: if ($settings) {
    applyTheme($settings.appearance.theme);
    applyFontSize($settings.appearance.fontSize);
  }
</script>

<HologramHud />

{#if showDownloadDialog}
  <DownloadDialog />
{/if}
