import { create } from 'zustand';

const ZOOM_KEY = 'signmaker-zoom';

function savedZoom(): number {
  try {
    const z = Number(localStorage.getItem(ZOOM_KEY));
    return z >= 1 && z <= 4 ? z : 1;
  } catch {
    return 1;
  }
}

export type Tab = '' | 'more' | 'png' | 'svg';
export type Skin = '' | 'inverse' | 'colorful';

export interface UiState {
  ui: string;
  alphabet: string;
  styling: string;
  charsets: string;
  grid: '0' | '1' | '2';
  skin: Skin;
  tab: Tab;
  /** Mobile only: whether the palette overlay drawer is open. */
  paletteOpen: boolean;
  /** Transient: hold ⌘/Ctrl alone to reveal every tool's keyboard shortcut. Never persisted to the URL. */
  learnShortcuts: boolean;
  /** Transient: whether the keyboard-shortcuts editor dialog is open. */
  shortcutsOpen: boolean;
  /** Canvas zoom factor (1 = 100%). Remembered in localStorage, never in the URL. */
  zoom: number;

  size: string;
  pad: string;
  line: string;
  fill: string;
  back: string;
  colorize: boolean;

  set: (patch: Partial<UiState>) => void;
}

export const UI_DEFAULTS = { ui: 'en', alphabet: 'iswa', grid: '1', tab: '' } as const;

export const useUiStore = create<UiState>((set) => ({
  ui: 'en',
  alphabet: 'iswa',
  styling: '',
  charsets: '',
  grid: '1',
  skin: '',
  tab: '',
  paletteOpen: false,
  learnShortcuts: false,
  shortcutsOpen: false,
  zoom: savedZoom(),

  size: '1',
  pad: '0',
  line: 'black',
  fill: 'white',
  back: '',
  colorize: false,

  set: (patch) => {
    if (patch.zoom !== undefined) localStorage.setItem(ZOOM_KEY, String(patch.zoom));
    set(patch);
  },
}));
