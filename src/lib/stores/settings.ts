import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProviderEndpoint {
  api_key: string;
  base_url: string;
  model: string;
}

export interface OllamaEndpoint {
  base_url: string;
  model: string;
}

export interface ProviderSettings {
  active: string;
  openai: ProviderEndpoint;
  anthropic: ProviderEndpoint;
  ollama: OllamaEndpoint;
}

export interface VoiceConfig {
  enabled: boolean;
  ptt_key: string;
  tts_enabled: boolean;
}

export interface AppearanceConfig {
  theme: string;
}

export interface PersonalityConfig {
  preset: string;
  custom_prompt: string;
}

export interface SearchConfig {
  provider: string;
  api_key: string;
}

export interface Settings {
  provider: ProviderSettings;
  voice: VoiceConfig;
  appearance: AppearanceConfig;
  personality: PersonalityConfig;
  search: SearchConfig;
}

// ── Defaults ──────────────────────────────────────────────────────────────

function defaultSettings(): Settings {
  return {
    provider: {
      active: 'ollama',
      openai: { api_key: '', base_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
      anthropic: { api_key: '', base_url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
      ollama: { base_url: 'http://localhost:11434', model: 'llama3' },
    },
    voice: { enabled: true, ptt_key: 'V', tts_enabled: true },
    appearance: { theme: 'dark' },
    personality: { preset: 'default', custom_prompt: '' },
    search: { provider: 'tavily', api_key: '' },
  };
}

// ── Store ─────────────────────────────────────────────────────────────────

function createSettingsStore() {
  const { subscribe, set, update } = writable<Settings>(defaultSettings());

  return {
    subscribe,

    /** Load settings from the Rust backend via IPC. */
    async load(): Promise<void> {
      try {
        const settings = await invoke<Settings>('get_settings');
        set(settings);
      } catch (err) {
        console.error('[settings] failed to load from backend, using defaults:', err);
        set(defaultSettings());
      }
    },

    /** Persist settings to disk via the Rust backend. */
    async save(settings: Settings): Promise<void> {
      try {
        await invoke('set_settings', { settings });
        set(settings);
      } catch (err) {
        console.error('[settings] failed to save:', err);
      }
    },

    /** Convenience: update a partial slice of settings. */
    async patch(partial: Partial<Settings>): Promise<void> {
      let current: Settings = defaultSettings();
      update((s) => {
        current = { ...s, ...partial };
        return current;
      });
      await invoke('set_settings', { settings: current });
    },
  };
}

export const settings = createSettingsStore();
