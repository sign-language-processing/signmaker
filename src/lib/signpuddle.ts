import { IANASignedLanguages } from '../i18n/ianaLanguages';

const SIGNPUDDLE_API = 'https://signpuddle.com/server';
const LIMIT = 20;

const COUNTRY = new Map<string, string>();
for (const l of IANASignedLanguages) {
  if (l.signed && l.country && !COUNTRY.has(l.signed)) COUNTRY.set(l.signed, l.country);
}

/** SignPuddle public dictionary for a signed language, e.g. ase → ase-US-dictionary-public.
 *  Empty when the language has no country (no puddle to search). */
export const puddleFor = (signed: string): string => {
  const country = COUNTRY.get(signed);
  return country ? `${signed}-${country.toUpperCase()}-dictionary-public` : '';
};

export interface PuddleEntry {
  sign: string; // SWU
  terms: string[];
}

/** Prefix search so results appear while the annotator is still typing. */
export async function searchPuddle(puddle: string, text: string, signal: AbortSignal): Promise<PuddleEntry[]> {
  const url = `${SIGNPUDDLE_API}/dictionary/${puddle}/search/terms/${encodeURIComponent(text)}?type=start&limit=${LIMIT}`;
  const res = await fetch(url, { signal });
  const data = (await res.json()) as { data?: PuddleEntry[] };
  return (data.data ?? []).filter((e) => e.sign);
}
