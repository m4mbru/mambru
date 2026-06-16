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
  fontSize: string;
  language: string;
}

export interface HologramConfig {
  enabled: boolean;
  style: string;
  size: number;
  position: string;
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
  hologram: HologramConfig;
}

// ── Defaults ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mambru-settings';

function loadFromStorage(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // localStorage not available or corrupted
  }
  return null;
}

function saveToStorage(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage not available
  }
}

function defaultSettings(): Settings {
  return {
    provider: {
      active: 'ollama',
      openai: { api_key: '', base_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
      anthropic: { api_key: '', base_url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
      ollama: { base_url: 'http://localhost:11434', model: 'llama3' },
    },
    voice: { enabled: true, ptt_key: 'V', tts_enabled: true },
    appearance: { theme: 'dark', fontSize: 'medium', language: 'en' },
    personality: { preset: 'default', custom_prompt: '' },
    search: { provider: 'tavily', api_key: '' },
    hologram: { enabled: true, style: 'stl:modelo-sofia', size: 200, position: 'floating' },
  };
}

// ── Store ─────────────────────────────────────────────────────────────────

function createSettingsStore() {
  const initial = loadFromStorage() ?? defaultSettings();
  const { subscribe, set, update } = writable<Settings>(initial);

  return {
    subscribe,

    /** Load settings from localStorage and optionally the Rust backend. */
    async load(): Promise<void> {
      const stored = loadFromStorage();
      if (stored) set(stored);

      try {
        const backend = await invoke<Settings>('get_settings');
        set(backend);
        saveToStorage(backend);
      } catch {
        // backend not available — localStorage is enough
      }
    },

    /** Persist settings to localStorage + try Rust backend. */
    async save(settings: Settings): Promise<void> {
      set(settings);
      saveToStorage(settings);
      try {
        await invoke('set_settings', { settings });
      } catch {
        // backend not available — localStorage fallback is already saved
      }
    },

    /** Convenience: update a partial slice of settings. */
    async patch(partial: Partial<Settings>): Promise<void> {
      let current: Settings = defaultSettings();
      update((s) => {
        current = { ...s, ...partial };
        return current;
      });
      set(current);
      saveToStorage(current);
      try {
        await invoke('set_settings', { settings: current });
      } catch {
        // backend not available
      }
    },
  };
}

export const settings = createSettingsStore();
