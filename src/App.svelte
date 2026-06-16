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
</script>

<HologramHud />

{#if showDownloadDialog}
  <DownloadDialog />
{/if}
