import { create } from 'zustand';

// font-ttf renders symbols from the Line (outline) + Fill fonts via canvas — those two gate the UI.
// SuttonSignWritingOneD (~8MB) is only used by the SWU text field in Settings, so it is left out of
// the eager load and lazy-fetched by its @font-face the first time that field renders. This keeps
// ~8MB off the startup critical path on low-end / slow connections.
export const SIGNWRITING_FONTS = ['SuttonSignWritingLine', 'SuttonSignWritingFill'] as const;

interface FontState {
  /** Whether the SignWriting fonts have loaded. Glyph SVG is empty until then. */
  ready: boolean;
}

// Always starts false, never seeded from document.fonts.check(): Chromium answers true for a face
// that is still downloading (status 'loading'), so seeding from it left `ready` stuck true from the
// first render — the flip that tells glyph and measurement consumers to recompute never fired, and
// on a cold load they kept whatever they derived from unmeasurable glyphs.
export const useFontStore = create<FontState>(() => ({ ready: false }));

/**
 * Request the SignWriting fonts and flip `ready` once they resolve.
 *
 * font-ttf renders glyphs as empty until these fonts are available, but nothing
 * requests them on its own: glyph measuring goes through a canvas, which never
 * triggers @font-face loading, and the empty glyph output means no DOM text
 * triggers it either. So we load them explicitly. `ready` is flipped in `finally`
 * so a failed font load degrades to the fallback glyph rather than leaving the UI
 * blank. Cached and locally-installed fonts resolve within a frame, so returning
 * visitors see no placeholder.
 */
export async function ensureSignWritingFonts(): Promise<void> {
  if (!document.fonts) {
    useFontStore.setState({ ready: true });
    return;
  }
  try {
    await Promise.all(SIGNWRITING_FONTS.map((family) => document.fonts.load(`1em "${family}"`)));
  } finally {
    useFontStore.setState({ ready: true });
  }
}
