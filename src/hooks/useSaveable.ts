import { useSignStore } from '../store/signStore';
import { useFontStore } from '../store/fontStore';

/**
 * Whether the Save controls should offer to save. Saveability is derived from glyph sizes, which
 * font-ttf can only measure once the SignWriting fonts load — before that `fswnorm` falls back to
 * the un-normalized sign and an oversized sign measures as fitting. Subscribing to font readiness
 * re-renders once the measurements are real; until then Save stays enabled rather than flashing
 * disabled, and the gate sits inside the selector so the measuring never runs on unmeasurable glyphs.
 */
export function useSaveable(): boolean {
  const ready = useFontStore((s) => s.ready);
  return useSignStore((s) => !ready || s.saveable());
}
