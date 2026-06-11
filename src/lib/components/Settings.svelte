<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { settings as settingsStore } from '../stores/settings';
  import type {
    Settings,
    ProviderSettings,
    VoiceConfig,
    AppearanceConfig,
    PersonalityConfig,
    SearchConfig,
  } from '../stores/settings';
  import { voice } from '../stores/voice';
  import { getCommands, saveCommand, deleteCommand, buildCommand } from '../api/tools';
  import type { Command, CommandAction } from '../api/tools';

  // ── Props ───────────────────────────────────────────────────────────────

  export let open = false;
  export let onClose: () => void = () => {};

  // ── Tab state ───────────────────────────────────────────────────────────

  type TabId = 'provider' | 'voice' | 'commands' | 'personality' | 'appearance' | 'avatar';
  let activeTab: TabId = 'provider';

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'provider', label: 'Provider', icon: 'cpu' },
    { id: 'voice', label: 'Voice', icon: 'mic' },
    { id: 'commands', label: 'Commands', icon: 'terminal' },
    { id: 'personality', label: 'Personality', icon: 'smile' },
    { id: 'appearance', label: 'Appearance', icon: 'eye' },
    { id: 'avatar', label: 'Avatar', icon: 'avatar' },
  ];

  // ── Local form state ───────────────────────────────────────────────────

  let localSettings: Settings;
  let connectionTesting = false;
  let connectionStatus: 'idle' | 'testing' | 'connected' | 'failed' = 'idle';

  // Voice
  let pttKeyBinding = 'V';
  let isListeningForKey = false;

  // Commands
  let commands: Command[] = [];
  let commandSearch = '';
  let showNewCommandForm = false;
  let newCommandName = '';
  let newCommandTrigger = '';
  let newCommandAction: CommandAction = { type: 'exec', command: '', args: [] };
  let newCommandRisk: 'Safe' | 'Medium' | 'Dangerous' = 'Safe';
  let nlCommandDescription = '';
  let buildingCommand = false;

  // Personality
  let customPromptDirty = false;

  // ── Derived ─────────────────────────────────────────────────────────────

  $: filteredCommands = commandSearch
    ? commands.filter(
        (c) =>
          c.name.toLowerCase().includes(commandSearch.toLowerCase()) ||
          c.trigger.toLowerCase().includes(commandSearch.toLowerCase()),
      )
    : commands;

  $: effectivePrompt = getEffectivePrompt();

  // ── Initialise ──────────────────────────────────────────────────────────

  onMount(() => {
    loadCommands();
  });

  // Reload commands when the tab becomes active and opens
  $: if (open && activeTab === 'commands') {
    loadCommands();
  }

  async function loadCommands() {
    try {
      commands = await getCommands();
    } catch (_) {
      commands = [];
    }
  }

  // ── Copy settings to local on open ──────────────────────────────────────

  $: if (open) {
    const unsub = settingsStore.subscribe((s) => {
      localSettings = JSON.parse(JSON.stringify(s));
    });
    unsub();
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!localSettings) return;
    try {
      await settingsStore.save(localSettings);
      // Apply theme immediately
      applyTheme(localSettings.appearance.theme);
    } catch (err) {
      console.error('[Settings] Failed to save:', err);
    }
  }

  function applyTheme(theme: string) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : '';
  }

  // ── Connection test ─────────────────────────────────────────────────────

  async function testConnection() {
    connectionStatus = 'testing';
    connectionTesting = true;
    // Simulate a connection test via IPC — backend would need a test endpoint
    try {
      // We'd ideally invoke a backend command here, but for now simulate
      await new Promise((resolve) => setTimeout(resolve, 1500));
      connectionStatus = 'connected';
    } catch (_) {
      connectionStatus = 'failed';
    } finally {
      connectionTesting = false;
    }
  }

  // ── PTT key binding ─────────────────────────────────────────────────────

  function startKeyListening() {
    isListeningForKey = true;
  }

  function handleKeyCapture(e: KeyboardEvent) {
    if (!isListeningForKey) return;
    e.preventDefault();
    e.stopPropagation();
    pttKeyBinding = e.key.toUpperCase();
    isListeningForKey = false;
    if (localSettings) {
      localSettings.voice.ptt_key = pttKeyBinding;
    }
  }

  // ── Commands ────────────────────────────────────────────────────────────

  function resetNewCommandForm() {
    showNewCommandForm = false;
    newCommandName = '';
    newCommandTrigger = '';
    newCommandAction = { type: 'exec', command: '', args: [] };
    newCommandRisk = 'Safe';
    nlCommandDescription = '';
  }

  async function handleAddCommand() {
    if (!newCommandName || !newCommandTrigger) return;
    const cmd: Command = {
      name: newCommandName,
      trigger: newCommandTrigger,
      action: newCommandAction,
      risk: newCommandRisk,
      confirm: null,
      enabled: true,
    };
    try {
      await saveCommand(cmd);
      await loadCommands();
      resetNewCommandForm();
    } catch (err) {
      console.error('[Settings] Failed to save command:', err);
    }
  }

  async function handleDeleteCommand(name: string) {
    try {
      await deleteCommand(name);
      await loadCommands();
    } catch (err) {
      console.error('[Settings] Failed to delete command:', err);
    }
  }

  async function handleBuildFromNL() {
    if (!nlCommandDescription.trim()) return;
    buildingCommand = true;
    try {
      const result = await buildCommand(nlCommandDescription);
      newCommandName = result.name;
      newCommandTrigger = result.trigger;
      newCommandAction = result.action;
      newCommandRisk = result.risk;
      showNewCommandForm = true;
      nlCommandDescription = '';
    } catch (err) {
      console.error('[Settings] Failed to build command:', err);
    } finally {
      buildingCommand = false;
    }
  }

  function getEffectivePrompt(): string {
    if (!localSettings) return '';
    const { preset, custom_prompt } = localSettings.personality;
    if (preset === 'custom' && custom_prompt) return custom_prompt;
    if (preset === 'professional') return professionalPrompt;
    return defaultPrompt;
  }

  // ── Import/Export commands (stubs) ──────────────────────────────────────

  function handleExport() {
    // In a real implementation, this would use Tauri's dialog API
    // for file save dialog and write commands.toml
    console.log('[Settings] Export commands (not yet implemented)');
  }

  function handleImport() {
    // In a real implementation, this would use Tauri's dialog API
    console.log('[Settings] Import commands (not yet implemented)');
  }

  // ── Default prompts ────────────────────────────────────────────────────

  const defaultPrompt = `You are Mambru, a versatile desktop assistant with a warm, slightly humorous personality. You're helpful, efficient, and occasionally sarcastic — but always respectful and task-focused. You communicate naturally in Rioplatense Spanish when the user speaks Spanish, switching to English when they do.

Your capabilities include:
- Answering questions and having natural conversations
- Executing custom commands (safe, medium, dangerous risk levels)
- Searching the web when asked
- Helping with productivity tasks

Keep responses concise but warm. Use humor appropriately — never at the expense of clarity or correctness.`;

  const professionalPrompt = `You are Mambru, a professional desktop assistant. You communicate clearly, precisely, and efficiently. You adapt to the user's language — responding in Rioplatense Spanish when addressed in Spanish, and English when addressed in English.

Your capabilities include:
- Answering questions with accurate, well-structured information
- Executing commands and automating tasks
- Searching the web for current information
- Assisting with productivity and technical work

Maintain a formal but approachable tone. Prioritize accuracy and clarity over personality.`;
</script>

<svelte:window on:keydown={handleKeyCapture} />

<!-- Settings slideover panel -->
<aside
  class="settings-panel"
  class:open
  role="dialog"
  aria-modal="true"
  aria-label="Settings"
>
  <!-- Overlay backdrop -->
  {#if open}
    <div class="settings-backdrop" on:click={onClose}></div>
  {/if}

  <!-- Panel -->
  <div
    class="settings-content"
    class:open
    in:slide={{ duration: 200, axis: 'x' }}
    out:slide={{ duration: 150, axis: 'x' }}
  >
    <!-- Header -->
    <div class="settings-header">
      <h2>Settings</h2>
      <button class="close-btn" on:click={onClose} aria-label="Close settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Tab navigation -->
    <nav class="tab-nav" role="tablist" aria-label="Settings tabs">
      {#each tabs as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab.id}
          on:click={() => (activeTab = tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls="tab-panel"
        >
          <span class="tab-icon">
            {#if tab.icon === 'cpu'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M20 9h3M1 15h3M20 15h3"/></svg>
            {:else if tab.icon === 'mic'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            {:else if tab.icon === 'terminal'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            {:else if tab.icon === 'smile'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {/if}
          </span>
          <span class="tab-label">{tab.label}</span>
        </button>
      {/each}
    </nav>

    <!-- Tab content -->
    <div class="tab-panel" id="tab-panel" role="tabpanel">
      {#if open && localSettings}
        <!-- Tab 1: Provider -->
        {#if activeTab === 'provider'}
          <div class="tab-section">
            <h3>LLM Provider</h3>
            <p class="section-desc">Select and configure your language model provider.</p>

            <div class="field">
              <label for="provider-select">Provider</label>
              <select
                id="provider-select"
                bind:value={localSettings.provider.active}
                on:change={handleSave}
              >
                <option value="ollama">Ollama (Local)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>

            {#if localSettings.provider.active === 'ollama'}
              <div class="field">
                <label for="ollama-url">Base URL</label>
                <input
                  id="ollama-url"
                  type="text"
                  bind:value={localSettings.provider.ollama.base_url}
                  on:change={handleSave}
                  placeholder="http://localhost:11434"
                />
              </div>
              <div class="field">
                <label for="ollama-model">Model</label>
                <input
                  id="ollama-model"
                  type="text"
                  bind:value={localSettings.provider.ollama.model}
                  on:change={handleSave}
                  placeholder="llama3"
                />
              </div>
            {:else if localSettings.provider.active === 'openai'}
              <div class="field">
                <label for="openai-key">API Key</label>
                <input
                  id="openai-key"
                  type="password"
                  bind:value={localSettings.provider.openai.api_key}
                  on:change={handleSave}
                  placeholder="sk-..."
                />
              </div>
              <div class="field">
                <label for="openai-url">Base URL</label>
                <input
                  id="openai-url"
                  type="text"
                  bind:value={localSettings.provider.openai.base_url}
                  on:change={handleSave}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div class="field">
                <label for="openai-model">Model</label>
                <input
                  id="openai-model"
                  type="text"
                  bind:value={localSettings.provider.openai.model}
                  on:change={handleSave}
                  placeholder="gpt-4o"
                />
              </div>
            {:else if localSettings.provider.active === 'anthropic'}
              <div class="field">
                <label for="anthropic-key">API Key</label>
                <input
                  id="anthropic-key"
                  type="password"
                  bind:value={localSettings.provider.anthropic.api_key}
                  on:change={handleSave}
                  placeholder="sk-ant-..."
                />
              </div>
              <div class="field">
                <label for="anthropic-url">Base URL</label>
                <input
                  id="anthropic-url"
                  type="text"
                  bind:value={localSettings.provider.anthropic.base_url}
                  on:change={handleSave}
                  placeholder="https://api.anthropic.com/v1"
                />
              </div>
              <div class="field">
                <label for="anthropic-model">Model</label>
                <input
                  id="anthropic-model"
                  type="text"
                  bind:value={localSettings.provider.anthropic.model}
                  on:change={handleSave}
                  placeholder="claude-sonnet-4-20250514"
                />
              </div>
            {/if}

            <button
              class="btn btn-secondary"
              on:click={testConnection}
              disabled={connectionTesting}
            >
              {connectionTesting ? 'Testing...' : 'Test Connection'}
            </button>

            {#if connectionStatus === 'connected'}
              <span class="status-badge status-ok">✓ Connected</span>
            {:else if connectionStatus === 'failed'}
              <span class="status-badge status-error">✗ Connection failed</span>
            {/if}
          </div>

        <!-- Tab 2: Voice -->
        {:else if activeTab === 'voice'}
          <div class="tab-section">
            <h3>Voice Settings</h3>
            <p class="section-desc">Configure speech input and output.</p>

            <div class="field">
              <label class="toggle-row">
                <span>Text-to-Speech</span>
                <label class="toggle" role="switch" aria-checked={localSettings.voice.tts_enabled} tabindex="0">
                  <input type="checkbox" bind:checked={localSettings.voice.tts_enabled} on:change={handleSave} class="toggle-input" />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </label>
              </label>
            </div>

            <div class="field">
              <label>Push-to-Talk Key</label>
              <button
                class="key-binding-btn"
                on:click={startKeyListening}
                disabled={isListeningForKey}
              >
                {#if isListeningForKey}
                  Press a key...
            {:else if tab.icon === 'avatar'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
            {:else}
                  <kbd>{pttKeyBinding}</kbd>
                {/if}
              </button>
            </div>

            <div class="field">
              <label for="voice-language">Voice Language</label>
              <select id="voice-language">
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
            </div>

            <div class="field">
              <label for="tts-volume">TTS Volume</label>
              <input
                id="tts-volume"
                type="range"
                min="0"
                max="100"
                value="80"
                class="range-input"
              />
            </div>

            <div class="voice-status">
              <span class="status-dot" class:available={$voice.sttAvailable}></span>
              Speech-to-Text: {$voice.sttAvailable ? 'Available' : 'Unavailable'}
            </div>
            <div class="voice-status">
              <span class="status-dot" class:available={$voice.ttsAvailable}></span>
              Text-to-Speech: {$voice.ttsAvailable ? 'Available' : 'Unavailable'}
            </div>
          </div>

        <!-- Tab 3: Commands -->
        {:else if activeTab === 'commands'}
          <div class="tab-section">
            <div class="section-header">
              <h3>Command Manager</h3>
              <div class="section-actions">
                <button class="btn btn-sm" on:click={handleImport}>Import</button>
                <button class="btn btn-sm" on:click={handleExport}>Export</button>
              </div>
            </div>
            <p class="section-desc">Manage custom commands that Mambru can execute.</p>

            <!-- Search -->
            <div class="search-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                bind:value={commandSearch}
                placeholder="Search commands..."
                aria-label="Search commands"
              />
            </div>

            <!-- AI-assisted creation -->
            <div class="nl-command-builder">
              <label for="nl-command">Create from description</label>
              <div class="nl-input-row">
                <input
                  id="nl-command"
                  type="text"
                  bind:value={nlCommandDescription}
                  placeholder='e.g. "cuando diga abrí Firefox abrí el navegador"'
                  disabled={buildingCommand}
                />
                <button
                  class="btn btn-sm btn-primary"
                  on:click={handleBuildFromNL}
                  disabled={buildingCommand || !nlCommandDescription.trim()}
                >
                  {buildingCommand ? '...' : 'Suggest'}
                </button>
              </div>
            </div>

            <!-- New command form (inline) -->
            {#if showNewCommandForm}
              <div class="command-form" transition:slide={{ duration: 150 }}>
                <h4>New Command</h4>
                <div class="field">
                  <label for="cmd-name">Name</label>
                  <input id="cmd-name" type="text" bind:value={newCommandName} placeholder="e.g. Open Firefox" />
                </div>
                <div class="field">
                  <label for="cmd-trigger">Trigger (regex)</label>
                  <input id="cmd-trigger" type="text" bind:value={newCommandTrigger} placeholder='e.g. abrí (?P<app>\w+)' />
                </div>
                <div class="field">
                  <label for="cmd-action">Action Type</label>
                  <select
                    id="cmd-action"
                    bind:value={newCommandAction.type}
                    on:change={() => {
                      if (newCommandAction.type === 'exec') {
                        newCommandAction = { type: 'exec', command: '', args: [] };
                      } else if (newCommandAction.type === 'script') {
                        newCommandAction = { type: 'script', path: '', args: [] };
                      } else if (newCommandAction.type === 'api') {
                        newCommandAction = { type: 'api', url: '', method: 'GET', body: null };
                      }
                    }}
                  >
                    <option value="exec">Shell Command</option>
                    <option value="script">Script</option>
                    <option value="api">API Call</option>
                  </select>
                </div>

                {#if newCommandAction.type === 'exec'}
                  <div class="field">
                    <label for="cmd-exec">Command</label>
                    <input id="cmd-exec" type="text" bind:value={newCommandAction.command} placeholder="e.g. start" />
                  </div>
                  <div class="field">
                    <label for="cmd-args">Arguments (comma-separated)</label>
                    <input
                      id="cmd-args"
                      type="text"
                      placeholder="e.g. {app}, --new-window"
                      on:change={(e) => {
                        const val = (e.target).value;
                        newCommandAction.args = val ? val.split(',').map(a => a.trim()) : [];
                      }}
                    />
                  </div>
                {:else if newCommandAction.type === 'script'}
                  <div class="field">
                    <label for="cmd-script">Script Path</label>
                    <input id="cmd-script" type="text" bind:value={newCommandAction.path} />
                  </div>
                  <div class="field">
                    <label for="cmd-script-args">Arguments</label>
                    <input id="cmd-script-args" type="text" placeholder="Comma-separated" />
                  </div>
                {:else if newCommandAction.type === 'api'}
                  <div class="field">
                    <label for="cmd-api-url">URL</label>
                    <input id="cmd-api-url" type="text" bind:value={newCommandAction.url} />
                  </div>
                  <div class="field">
                    <label for="cmd-api-method">Method</label>
                    <select id="cmd-api-method" bind:value={newCommandAction.method}>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                {/if}

                <div class="field">
                  <label for="cmd-risk">Risk Level</label>
                  <select id="cmd-risk" bind:value={newCommandRisk}>
                    <option value="Safe">Safe (auto-execute)</option>
                    <option value="Medium">Medium (confirm)</option>
                    <option value="Dangerous">Dangerous (preview + approve)</option>
                  </select>
                </div>

                <div class="form-actions">
                  <button class="btn btn-sm" on:click={resetNewCommandForm}>Cancel</button>
                  <button class="btn btn-sm btn-primary" on:click={handleAddCommand}>Save</button>
                </div>
              </div>
            {:else}
              <button class="btn btn-primary btn-block" on:click={() => (showNewCommandForm = true)}>
                + New Command
              </button>
            {/if}

            <!-- Command list -->
            <div class="commands-list">
              {#if filteredCommands.length === 0}
                <p class="empty-commands">
                  {commandSearch ? 'No commands match your search.' : 'No custom commands yet. Create one above.'}
                </p>
              {:else}
                {#each filteredCommands as cmd}
                  <div class="command-item">
                    <div class="cmd-info">
                      <span class="cmd-name">{cmd.name}</span>
                      <code class="cmd-trigger">{cmd.trigger}</code>
                      <span class="risk-badge-sm risk-{cmd.risk.toLowerCase()}">{cmd.risk}</span>
                    </div>
                    <div class="cmd-actions">
                      <label class="toggle" role="switch" aria-checked={cmd.enabled}>
                        <input type="checkbox" checked={cmd.enabled} on:change={() => {}} class="toggle-input" />
                        <span class="toggle-track">
                          <span class="toggle-thumb"></span>
                        </span>
                      </label>
                      <button class="icon-btn" on:click={() => handleDeleteCommand(cmd.name)} title="Delete command" aria-label="Delete {cmd.name}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>

        <!-- Tab 4: Personality -->
        {:else if activeTab === 'personality'}
          <div class="tab-section">
            <h3>Personality</h3>
            <p class="section-desc">Customise Mambru's conversational style and system prompt.</p>

            <div class="field">
              <label for="preset-select">Preset</label>
              <select
                id="preset-select"
                bind:value={localSettings.personality.preset}
                on:change={handleSave}
              >
                <option value="default">Default (Mambru)</option>
                <option value="professional">Professional</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {#if localSettings.personality.preset === 'custom'}
              <div class="field">
                <label for="custom-prompt">Custom System Prompt</label>
                <textarea
                  id="custom-prompt"
                  bind:value={localSettings.personality.custom_prompt}
                  on:input={() => (customPromptDirty = true)}
                  on:change={handleSave}
                  rows="8"
                  placeholder="Write your custom system prompt here..."
                  class="prompt-textarea"
                ></textarea>
                {#if customPromptDirty}
                  <p class="hint">Changes are saved automatically when you close settings.</p>
                {/if}
              </div>
            {/if}

            <div class="field">
              <label>Effective System Prompt</label>
              <div class="prompt-preview">
                <pre>{effectivePrompt}</pre>
              </div>
              {#if localSettings.personality.preset !== 'default'}
                <button class="btn btn-sm" on:click={() => {
                  localSettings.personality.preset = 'default';
                  localSettings.personality.custom_prompt = '';
                  customPromptDirty = false;
                  handleSave();
                }}>
                  Reset to Default
                </button>
              {/if}
            </div>
          </div>

        <!-- Tab 5: Appearance -->
        {:else if activeTab === 'appearance'}
          <div class="tab-section">
            <h3>Appearance</h3>
            <p class="section-desc">Customise the look and feel of Mambru.</p>

            <div class="field">
              <label>Theme</label>
              <div class="theme-options">
                <button
                  class="theme-option"
                  class:active={localSettings.appearance.theme === 'dark'}
                  on:click={() => {
                    localSettings.appearance.theme = 'dark';
                    handleSave();
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  <span>Dark</span>
                </button>
                <button
                  class="theme-option"
                  class:active={localSettings.appearance.theme === 'light'}
                  on:click={() => {
                    localSettings.appearance.theme = 'light';
                    handleSave();
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  <span>Light</span>
                </button>
              </div>
            </div>

            <div class="field">
              <label for="font-size">Font Size</label>
              <select id="font-size" bind:value={localSettings.appearance.theme} on:change={handleSave}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>

            <div class="field">
              <label for="language">Language</label>
              <select id="language">
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
              <p class="hint">Controls UI language. Chat language adapts to your messages.</p>
            </div>
          </div>

        <!-- Tab 6: Avatar -->
        {:else if activeTab === 'avatar'}
          <div class="tab-section">
            <h3>Holographic Avatar</h3>
            <p class="section-desc">Customise your 3D particle avatar that reacts to conversation and music.</p>

            <div class="field">
              <label class="toggle-row">
                <span>Enable Avatar</span>
                <label class="toggle" role="switch" aria-checked={localSettings.hologram.enabled} tabindex="0">
                  <input type="checkbox" bind:checked={localSettings.hologram.enabled} on:change={handleSave} class="toggle-input" />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </label>
              </label>
            </div>

            <div class="field">
              <label for="avatar-style">Style</label>
              <select
                id="avatar-style"
                bind:value={localSettings.hologram.style}
                on:change={handleSave}
              >
                <option value="woman1">Woman 1</option>
                <option value="woman2">Woman 2</option>
                <option value="man1">Man 1</option>
                <option value="man2">Man 2</option>
                <option value="sphere">Sphere</option>
              </select>
            </div>

            <div class="field">
              <label for="avatar-size">Size</label>
              <div class="range-with-value">
                <input
                  id="avatar-size"
                  type="range"
                  min="100"
                  max="400"
                  step="10"
                  bind:value={localSettings.hologram.size}
                  on:change={handleSave}
                  class="range-input"
                />
                <span class="range-value">{localSettings.hologram.size}px</span>
              </div>
            </div>

            <div class="field">
              <label for="avatar-position">Position</label>
              <select
                id="avatar-position"
                bind:value={localSettings.hologram.position}
                on:change={handleSave}
              >
                <option value="floating">Floating (bottom-right)</option>
                <option value="minimal">Minimal (corner)</option>
                <option value="panel">Panel (sidebar)</option>
              </select>
            </div>

            <div class="preview-note">
              <p>Changes take effect immediately.</p>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Footer with save button -->
    <div class="settings-footer">
      <span class="footer-hint">Settings are saved automatically</span>
    </div>
  </div>
</aside>

<style>
  /* ── Panel layout ───────────────────────────── */

  .settings-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--settings-width);
    max-width: 100vw;
    z-index: var(--z-settings);
    pointer-events: none;
  }

  .settings-panel.open {
    pointer-events: auto;
  }

  .settings-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: -1;
  }

  .settings-content {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    background: var(--color-bg-secondary);
    border-left: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  /* ── Header ──────────────────────────────────── */

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .settings-header h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  /* ── Tab nav ──────────────────────────────────── */

  .tab-nav {
    display: flex;
    gap: 2px;
    padding: var(--space-sm) var(--space-lg);
    border-bottom: 1px solid var(--color-border);
    overflow-x: auto;
    flex-shrink: 0;
    background: var(--color-bg);
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm) var(--space-md);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--font-size-sm);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .tab-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-surface-hover);
  }

  .tab-btn.active {
    color: var(--color-primary);
    background: rgba(123, 104, 238, 0.1);
  }

  .tab-icon {
    display: flex;
    align-items: center;
  }

  .tab-label {
    font-weight: 500;
  }

  /* ── Tab panel ────────────────────────────────── */

  .tab-panel {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
  }

  .tab-section h3 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 var(--space-xs);
  }

  .section-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-lg);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-xs);
  }

  .section-header h3 {
    margin: 0;
  }

  .section-actions {
    display: flex;
    gap: var(--space-xs);
  }

  /* ── Form fields ──────────────────────────────── */

  .field {
    margin-bottom: var(--space-md);
  }

  .field label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-xs);
  }

  .field input[type='text'],
  .field input[type='password'],
  .field select,
  .field textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    transition: border-color var(--transition-fast);
  }

  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    border-color: var(--color-border-focus);
    outline: none;
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    margin-top: var(--space-xs);
  }

  /* ── Toggle switch ────────────────────────────── */

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }

  .toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .toggle-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    width: 36px;
    height: 20px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    transition: background var(--transition-fast);
    position: relative;
  }

  .toggle-input:checked + .toggle-track {
    background: var(--color-primary);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .toggle-input:checked + .toggle-track .toggle-thumb {
    transform: translateX(16px);
  }

  /* ── Key binding ──────────────────────────────── */

  .key-binding-btn {
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    cursor: pointer;
    font-size: var(--font-size-sm);
    min-width: 100px;
    text-align: center;
  }

  .key-binding-btn:hover {
    border-color: var(--color-border-focus);
  }

  .key-binding-btn kbd {
    font-family: var(--font-mono);
    font-size: var(--font-size-md);
    font-weight: 600;
  }

  /* ── Voice status ─────────────────────────────── */

  .voice-status {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-xs);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }

  .status-dot.available {
    background: var(--color-success);
  }

  /* ── Range input ──────────────────────────────── */

  .range-input {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .range-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-primary);
    cursor: pointer;
    border: 2px solid var(--color-surface);
  }

  /* ── Connection test ──────────────────────────── */

  .status-badge {
    display: inline-block;
    margin-left: var(--space-sm);
    font-size: var(--font-size-xs);
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }

  .status-ok {
    background: rgba(0, 212, 170, 0.15);
    color: var(--color-success);
  }

  .status-error {
    background: var(--color-danger-bg);
    color: var(--color-danger);
  }

  /* ── Commands ─────────────────────────────────── */

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
    color: var(--color-text-muted);
  }

  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--color-text);
    font-size: var(--font-size-sm);
    outline: none;
  }

  .nl-command-builder {
    margin-bottom: var(--space-md);
    padding: var(--space-md);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }

  .nl-command-builder label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    margin-bottom: var(--space-xs);
  }

  .nl-input-row {
    display: flex;
    gap: var(--space-xs);
  }

  .nl-input-row input {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: var(--font-size-sm);
  }

  .command-form {
    padding: var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-md);
  }

  .command-form h4 {
    font-size: var(--font-size-md);
    font-weight: 600;
    margin: 0 0 var(--space-md);
  }

  .form-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: flex-end;
    margin-top: var(--space-md);
  }

  .commands-list {
    margin-top: var(--space-md);
  }

  .empty-commands {
    text-align: center;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    padding: var(--space-xl) 0;
  }

  .command-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-xs);
    transition: background var(--transition-fast);
  }

  .command-item:hover {
    background: var(--color-surface-hover);
  }

  .cmd-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-width: 0;
  }

  .cmd-name {
    font-weight: 500;
    font-size: var(--font-size-sm);
    white-space: nowrap;
  }

  .cmd-trigger {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .risk-badge-sm {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .risk-safe {
    background: rgba(0, 212, 170, 0.15);
    color: var(--color-success);
  }

  .risk-medium {
    background: var(--color-warning-bg);
    color: var(--color-warning);
  }

  .risk-dangerous {
    background: var(--color-danger-bg);
    color: var(--color-danger);
  }

  .cmd-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .icon-btn:hover {
    background: var(--color-danger-bg);
    color: var(--color-danger);
  }

  /* ── Personality ──────────────────────────────── */

  .prompt-textarea {
    resize: vertical;
    min-height: 120px;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    line-height: 1.6;
  }

  .prompt-preview {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    max-height: 200px;
    overflow-y: auto;
  }

  .prompt-preview pre {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0;
  }

  /* ── Theme options ────────────────────────────── */

  .theme-options {
    display: flex;
    gap: var(--space-sm);
  }

  .theme-option {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-lg) var(--space-md);
    background: var(--color-surface);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .theme-option:hover {
    border-color: var(--color-text-muted);
  }

  .theme-option.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: rgba(123, 104, 238, 0.05);
  }

  /* ── Avatar tab ─────────────────────────────── */

  .range-with-value {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .range-with-value .range-input {
    flex: 1;
  }

  .range-value {
    min-width: 48px;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 600;
    text-align: right;
  }

  .preview-note {
    margin-top: var(--space-lg);
    padding: var(--space-md);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  .preview-note p {
    margin: 0;
  }

  /* ── Footer ───────────────────────────────────── */

  .settings-footer {
    padding: var(--space-sm) var(--space-lg);
    border-top: 1px solid var(--color-border);
    text-align: center;
    flex-shrink: 0;
  }

  .footer-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  /* ── Buttons ──────────────────────────────────── */

  .btn {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition: all var(--transition-fast);
    font-family: var(--font-sans);
  }

  .btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-sm {
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-xs);
  }

  .btn-primary {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-secondary {
    background: var(--color-surface-hover);
  }

  .btn-block {
    width: 100%;
  }
</style>
