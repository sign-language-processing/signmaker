import { useEffect, useMemo, useRef, useState, type ComponentType, type SVGProps } from 'react';
import { useSignStore } from '../store/signStore';
import { useLangStore } from '../store/langStore';
import { useToolStore, type Tool } from '../store/toolStore';
import { useTranslation } from '../hooks/useTranslation';
import { IANASignedLanguages } from '../i18n/ianaLanguages';
import { signedLanguageName, spokenLanguageName, spokenApiCode, mouthingSupported } from '../i18n/languageNames';
import { signNormalize, swu2fsw } from '../lib/sign';
import { puddleFor, searchPuddle } from '../lib/signpuddle';
import { useSignSvg } from '../hooks/useGlyph';
import { recaptchaToken } from '../lib/recaptcha';
import { apiDomain } from '../lib/api';
import { LanguageIcon, HandIcon, MouthIcon, TranslateIcon, SearchIcon } from './icons';

const API = `https://signwriting.${apiDomain}`;
const TRANSLATE_API = `https://sw-translation.${apiDomain}`;
const DEBOUNCE_MS = 300;

// Ping /health the first time a tool opens: confirms the server is up and warms
// the machine so the first real request isn't slow. Retries on a future open if it fails.
const warmed = new Set<string>();
function warmUp(api: string): void {
  if (warmed.has(api)) return;
  warmed.add(api);
  fetch(`${api}/health`).catch(() => {
    warmed.delete(api);
  });
}
const SPOKEN_CODES = [...new Set(IANASignedLanguages.map((l) => l.spoken).filter(Boolean))];
const SIGNED_TO_SPOKEN = new Map(IANASignedLanguages.map((l) => [l.signed, l.spoken]));
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function LanguagePopover() {
  const { signed, spoken, set } = useLangStore();
  const { t } = useTranslation();

  const spokenOptions = useMemo(() => SPOKEN_CODES.map((code) => ({ code, name: spokenLanguageName(code) })).sort(byName), []);
  // Cross-filter: when a spoken language is chosen, only its paired sign languages are offered.
  const signedOptions = useMemo(() => {
    const seen = new Set<string>();
    return IANASignedLanguages.filter((l) => l.signed && (!spoken || l.spoken === spoken))
      .filter((l) => (seen.has(l.signed) ? false : (seen.add(l.signed), true)))
      .map((l) => ({ code: l.signed, name: signedLanguageName(l.signed) }))
      .sort(byName);
  }, [spoken]);

  return (
    <div className="tool-popover">
      <label className="tool-field">
        <span>{t('spoken')}</span>
        <select value={spoken} onChange={(e) => set({ spoken: e.target.value, signed: SIGNED_TO_SPOKEN.get(signed) === e.target.value ? signed : '' })}>
          <option value="">—</option>
          {spokenOptions.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="tool-field">
        <span>{t('signed')}</span>
        <select value={signed} onChange={(e) => set({ signed: e.target.value, spoken: SIGNED_TO_SPOKEN.get(e.target.value) || spoken })}>
          <option value="">—</option>
          {signedOptions.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="tool-clear" onClick={() => set({ signed: '', spoken: '' })}>
        {t('clear')}
      </button>
    </div>
  );
}

type TextTool = 'fingerspelling' | 'mouthing' | 'translate' | 'search';
interface Result {
  fsw: string;
  tip?: string; // entry terms for search results; generated signs use the default tip
}

async function generateResults(tool: TextTool, text: string, signed: string, spoken: string, signal: AbortSignal): Promise<Result[]> {
  if (tool === 'search') {
    const entries = await searchPuddle(puddleFor(signed), text, signal);
    return entries.map((e) => ({ fsw: signNormalize(swu2fsw(e.sign)), tip: e.terms.join(', ') }));
  }
  if (tool === 'translate') {
    const token = await recaptchaToken('api_request');
    const res = await fetch(`${TRANSLATE_API}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-recaptcha-token': token },
      body: JSON.stringify({ texts: [text], spoken_language: spoken, signed_language: signed }),
      signal,
    });
    const data = (await res.json()) as { output?: string[] };
    // The output may be several space-separated signs; each becomes its own pick.
    // The model emits placeholder M500x500 boxes; recompute them from the actual
    // glyph extents so the svg (and addSign placement) get the real size.
    return (data.output?.[0] || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((fsw) => ({ fsw: signNormalize(fsw) }));
  }
  const url =
    tool === 'fingerspelling'
      ? `${API}/fingerspelling?text=${encodeURIComponent(text)}&signed_language=${signed}`
      : `${API}/mouthing?text=${encodeURIComponent(text)}&spoken_language=${spokenApiCode(spoken)}`;
  const res = await fetch(url, { signal });
  const data = (await res.json()) as { fsw?: string };
  return data.fsw ? [{ fsw: data.fsw }] : [];
}

const PLACEHOLDER: Record<TextTool, 'wordToFingerspell' | 'wordToMouth' | 'textToTranslate' | 'wordToSearch'> = {
  fingerspelling: 'wordToFingerspell',
  mouthing: 'wordToMouth',
  translate: 'textToTranslate',
  search: 'wordToSearch',
};

function ResultButton({ fsw, tip, selected, onPick }: { fsw: string; tip: string; selected: boolean; onPick: () => void }) {
  const svg = useSignSvg(fsw);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      className={`tool-use${selected ? ' is-selected' : ''}`}
      data-tip={tip}
      aria-label={tip}
      onClick={onPick}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function GeneratePopover({ tool, onClose }: { tool: TextTool; onClose: () => void }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const addSign = useSignStore((s) => s.addSign);
  const { signed, spoken } = useLangStore();
  const { t } = useTranslation();

  useEffect(() => {
    inputRef.current?.focus();
    if (tool !== 'search') warmUp(tool === 'translate' ? TRANSLATE_API : API);
  }, [tool]);

  // Keyed on the trimmed text so whitespace-only edits don't abort and re-fire the request.
  const trimmed = text.trim();
  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const found = await generateResults(tool, trimmed, signed, spoken, controller.signal);
        setResults(found);
        setSelected(0);
        setStatus(found.length ? 'idle' : 'empty');
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          setStatus('empty');
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, tool, signed, spoken]);

  const pick = (fsw: string) => {
    addSign(fsw);
    onClose();
  };

  return (
    <div className="tool-popover">
      <input
        ref={inputRef}
        className="tool-input"
        placeholder={t(PLACEHOLDER[tool])}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected((s) => (s + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(results[selected].fsw);
          }
        }}
      />
      <div className={`tool-result${status === 'idle' && results.length > 1 ? ' tool-results' : ''}`}>
        {status === 'loading' && <span className="tool-hint">…</span>}
        {status === 'empty' && <span className="tool-hint">{t('noResult')}</span>}
        {status === 'idle' &&
          results.map((r, i) => (
            <ResultButton key={i} fsw={r.fsw} tip={r.tip || t('addToCanvas')} selected={i === selected} onPick={() => pick(r.fsw)} />
          ))}
      </div>
    </div>
  );
}

function ToolButton({
  tool,
  label,
  Icon,
  disabled,
  open,
  onToggle,
}: {
  tool: Tool;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  disabled?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`canvas-btn${open ? ' is-pressed' : ''}`}
      data-tip={label}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      data-tool={tool}
    >
      <Icon />
    </button>
  );
}

export function CanvasTooling() {
  const { open, setOpen } = useToolStore();
  const ref = useRef<HTMLDivElement>(null);
  const { signed, spoken } = useLangStore();
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const toggle = (tool: Tool) => setOpen(open === tool ? null : tool);

  return (
    <div className="canvas-tooling" ref={ref}>
      {open === 'language' && <LanguagePopover />}
      {open && open !== 'language' && <GeneratePopover tool={open} onClose={() => setOpen(null)} />}
      <div className="tooling-buttons">
        <ToolButton tool="language" label={t('languages')} Icon={LanguageIcon} open={open === 'language'} onToggle={() => toggle('language')} />
        <ToolButton
          tool="fingerspelling"
          label={signed ? `${t('fingerspelling')} (F)` : `${t('fingerspelling')} — ${t('pickSignedLanguage')}`}
          Icon={HandIcon}
          disabled={!signed}
          open={open === 'fingerspelling'}
          onToggle={() => toggle('fingerspelling')}
        />
        <ToolButton
          tool="mouthing"
          label={
            !spoken
              ? `${t('mouthing')} — ${t('pickSpokenLanguage')}`
              : !mouthingSupported(spoken)
                ? t('mouthingUnavailable')
                : `${t('mouthing')} (M)`
          }
          Icon={MouthIcon}
          disabled={!spoken || !mouthingSupported(spoken)}
          open={open === 'mouthing'}
          onToggle={() => toggle('mouthing')}
        />
        <ToolButton
          tool="translate"
          label={
            !spoken
              ? `${t('translate')} — ${t('pickSpokenLanguage')}`
              : !signed
                ? `${t('translate')} — ${t('pickSignedLanguage')}`
                : `${t('translate')} (T)`
          }
          Icon={TranslateIcon}
          disabled={!signed || !spoken}
          open={open === 'translate'}
          onToggle={() => toggle('translate')}
        />
        <ToolButton
          tool="search"
          label={puddleFor(signed) ? `${t('search')} (L)` : `${t('search')} — ${t('pickSignedLanguage')}`}
          Icon={SearchIcon}
          disabled={!puddleFor(signed)}
          open={open === 'search'}
          onToggle={() => toggle('search')}
        />
      </div>
    </div>
  );
}
