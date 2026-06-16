<script lang="ts">
  import { settings } from '../stores/settings';

  const styles = [
    { id: 'woman1', label: 'Silueta 1', icon: '♀' },
    { id: 'woman2', label: 'Silueta 2', icon: '♀' },
    { id: 'man1', label: 'Figura 1', icon: '♂' },
    { id: 'man2', label: 'Figura 2', icon: '♂' },
    { id: 'head', label: 'Cabeza', icon: '◉' },
    { id: 'sphere', label: 'Esfera', icon: '◎' },
  ];

  $: currentStyle = $settings.hologram.style;

  async function selectStyle(id: string) {
    await settings.patch({
      hologram: { ...$settings.hologram, style: id },
    });
  }
</script>

<div class="avatar-grid">
  {#each styles as style}
    <button
      class="avatar-option"
      class:active={currentStyle === style.id}
      on:click={() => selectStyle(style.id)}
    >
      <span class="avatar-icon">{style.icon}</span>
      <span class="avatar-label">{style.label}</span>
    </button>
  {/each}
</div>

<style>
  .avatar-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .avatar-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px;
    background: rgba(0, 188, 212, 0.04);
    border: 1px solid rgba(0, 188, 212, 0.15);
    border-radius: 8px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.25s ease;
    font-family: inherit;
    font-size: 11px;
  }

  .avatar-option:hover {
    background: rgba(0, 188, 212, 0.1);
    border-color: rgba(0, 188, 212, 0.4);
    color: #00BCD4;
    transform: scale(1.05);
  }

  .avatar-option.active {
    background: rgba(0, 188, 212, 0.15);
    border-color: #00BCD4;
    color: #00BCD4;
    box-shadow: 0 0 15px rgba(0, 188, 212, 0.2);
  }

  .avatar-icon {
    font-size: 20px;
    line-height: 1;
  }

  .avatar-label {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
</style>
