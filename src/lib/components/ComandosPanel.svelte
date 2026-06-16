<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { getCommands } from '../api/tools';
  import type { Command } from '../api/tools';

  let commands: Command[] = [];
  let search = '';

  onMount(async () => {
    try {
      commands = await getCommands();
    } catch (_) {
      commands = [];
    }
  });

  $: filtered = search
    ? commands.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.trigger.toLowerCase().includes(search.toLowerCase()),
      )
    : commands;

  async function executeCommand(cmd: Command) {
    try {
      await invoke('execute_command', { name: cmd.name, trigger: cmd.trigger });
    } catch (_) {
      // Backend command execution not available yet
    }
  }
</script>

<div class="comandos-panel">
  <div class="search-box">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
    <input
      type="text"
      bind:value={search}
      placeholder="Search commands..."
      aria-label="Search commands"
    />
  </div>

  <div class="commands-list">
    {#if filtered.length === 0}
      <p class="empty">No commands found.</p>
    {:else}
      {#each filtered as cmd}
        <button class="command-item" on:click={() => executeCommand(cmd)}>
          <div class="cmd-info">
            <span class="cmd-name">{cmd.name}</span>
            <code class="cmd-trigger">{cmd.trigger}</code>
          </div>
          <span class="risk-badge risk-{cmd.risk.toLowerCase()}">{cmd.risk}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .comandos-panel {
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(0, 188, 212, 0.05);
    border: 1px solid rgba(0, 188, 212, 0.2);
    border-radius: 8px;
    color: rgba(0, 188, 212, 0.6);
    flex-shrink: 0;
  }

  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text);
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    outline: none;
  }

  .search-box input::placeholder {
    color: var(--color-text-muted);
  }

  .commands-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .command-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: rgba(0, 188, 212, 0.04);
    border: 1px solid rgba(0, 188, 212, 0.15);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 100%;
    text-align: left;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: inherit;
  }

  .command-item:hover {
    background: rgba(0, 188, 212, 0.1);
    border-color: rgba(0, 188, 212, 0.4);
  }

  .cmd-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .cmd-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .cmd-trigger {
    font-size: 11px;
    color: rgba(0, 188, 212, 0.6);
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .risk-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .risk-safe {
    background: rgba(0, 212, 170, 0.15);
    color: #00D4AA;
  }

  .risk-medium {
    background: rgba(255, 193, 7, 0.15);
    color: #FFC107;
  }

  .risk-dangerous {
    background: rgba(255, 68, 68, 0.15);
    color: #FF4444;
  }

  .empty {
    text-align: center;
    color: var(--color-text-muted);
    font-size: 13px;
    padding: 32px 0;
  }
</style>
