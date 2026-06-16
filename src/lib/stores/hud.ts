import { writable } from 'svelte/store';

export type HudMode = 'orbital' | 'expanding' | 'expanded' | 'collapsing';
export type PanelId = 'clock' | 'terminal' | 'chat' | 'comandos' | 'system' | 'settings' | null;

export interface HudState {
  mode: HudMode;
  activePanel: PanelId;
}

export const hudState = writable<HudState>({ mode: 'orbital', activePanel: null });

export const PANEL_ORDER: PanelId[] = ['clock', 'terminal', 'chat', 'comandos', 'system', 'settings'];

export function expandPanel(id: PanelId): void {
  hudState.update((state) => {
    if (state.mode === 'expanded' && state.activePanel === id) {
      return { ...state, mode: 'collapsing' };
    }
    return { ...state, mode: 'expanding', activePanel: id };
  });

  setTimeout(() => {
    hudState.update((state) => {
      if (state.mode === 'expanding') {
        return { ...state, mode: 'expanded' };
      }
      return state;
    });
  }, 300);
}

export function collapsePanel(): void {
  hudState.update((state) => {
    if (state.mode === 'expanded' || state.mode === 'expanding') {
      return { ...state, mode: 'collapsing' };
    }
    return state;
  });

  setTimeout(() => {
    hudState.update((state) => {
      if (state.mode === 'collapsing') {
        return { ...state, mode: 'orbital', activePanel: null };
      }
      return state;
    });
  }, 250);
}
