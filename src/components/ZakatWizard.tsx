'use client';

import { useReducer, useState, useEffect, useRef } from 'react';
import { TYPES, Consult, type Facts, type Question } from '@/lib/consult';
import { reason, type ZakatResult } from '@/lib/engine';
import { money } from '@/lib/calc';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type Screen = 'home' | 'question' | 'confirm' | 'result';

interface State {
  screen:  Screen;
  facts:   Facts;
  history: Facts[];
  result:  ZakatResult | null;
  view:    'pengguna' | 'pakar';
  animKey: number;
}

type Action =
  | { type: 'SELECT_TYPE'; zakatType: string }
  | { type: 'ANSWER'; qid: string; value: unknown }
  | { type: 'BACK' }
  | { type: 'RESET' }
  | { type: 'SET_VIEW'; view: 'pengguna' | 'pakar' }
  | { type: 'CONFIRM' };

const INIT: State = { screen: 'home', facts: {}, history: [], result: null, view: 'pengguna', animKey: 0 };

function reducer(s: State, a: Action): State {
  const k = s.animKey + 1;
  switch (a.type) {
    case 'SELECT_TYPE': {
      const facts = { zakatType: a.zakatType };
      const q = Consult.next(facts);
      return { ...s, facts, history: [], result: null, screen: q ? 'question' : 'result', animKey: k };
    }
    case 'ANSWER': {
      const facts = Consult.apply({ ...s.facts }, a.qid, a.value);
      const q     = Consult.next(facts);
      if (q) return { ...s, history: [...s.history, s.facts], facts, screen: 'question', animKey: k };
      return { ...s, history: [...s.history, s.facts], facts, screen: 'confirm', animKey: k };
    }
    case 'CONFIRM':
      return { ...s, result: reason(s.facts), screen: 'result', animKey: k };
    case 'BACK': {
      if (!s.history.length) return { ...s, screen: 'home', facts: {}, result: null, animKey: k };
      const history = [...s.history];
      const facts   = history.pop()!;
      const q       = Consult.next(facts);
      return { ...s, facts, history, result: null, screen: q ? 'question' : 'home', animKey: k };
    }
    case 'RESET':    return { ...INIT, view: s.view, animKey: k };
    case 'SET_VIEW': return { ...s, view: a.view };
    default:         return s;
  }
}

const PHASES = ['Jenis Zakat', 'Syarat Wajib', 'Maklumat', 'Keputusan'];

function phaseIdx(screen: Screen, q: Question | null): number {
  if (screen === 'home')   return 0;
  if (screen === 'result') return 3;
  if (screen === 'confirm') return 2;
  if (!q) return 3;
  if (q.phase === 'Syarat Wajib') return 1;
  return 2;
}

function pct(screen: Screen, histLen: number): number {
  if (screen === 'home')   return 0;
  if (screen === 'confirm') return 90;
  if (screen === 'result') return 100;
  return Math.min(88, 12 + histLen * 14);
}

function SelangorIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M16.5 15.6a6 6 0 1 1 0-9.2 7.2 7.2 0 1 0 0 9.2Z" fill="#F9C513"/>
      <path d="M18.2 8.1l.7 1.9 1.9.1-1.5 1.2.5 1.9-1.6-1.1-1.6 1.1.5-1.9-1.5-1.2 1.9-.1.8-1.9Z" fill="white"/>
    </svg>
  );
}

function Sidebar({ phase, view, onView }: { phase: number; view: string; onView: (v: 'pengguna' | 'pakar') => void }) {
  return (
    <aside style={{ width: 260, minHeight: '100vh', background: '#0D0304', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(206,17,38,0.18)', flexShrink: 0 }}>
      <div style={{ padding: '28px 24px 22px', borderBottom: '1px solid rgba(206,17,38,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: '#CE1126', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <SelangorIcon />
          </div>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 14.5, color: 'white', lineHeight: 1.15 }}>Sistem Pakar Zakat</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#F9C513', marginTop: 3 }}>Lembaga Zakat Selangor</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '32px 24px' }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 22 }}>Peringkat</div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 11, top: 24, bottom: 24, width: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1 }} />
          <div style={{ position: 'absolute', left: 11, top: 24, width: 2, background: '#CE1126', borderRadius: 1, height: `${(phase / (PHASES.length - 1)) * 100}%`, transition: 'height 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {PHASES.map((p, i) => {
              const done = i < phase, active = i === phase;
              return (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${done ? '#CE1126' : active ? '#F9C513' : 'rgba(255,255,255,0.15)'}`, background: done ? '#CE1126' : '#0D0304', display: 'grid', placeItems: 'center', flexShrink: 0, position: 'relative', zIndex: 1, transition: 'all 0.35s' }}>
                    {done
                      ? <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#F9C513' : 'transparent' }} />}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: active ? 700 : done ? 500 : 400, color: active ? '#F9C513' : done ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)', transition: 'all 0.3s' }}>{p}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 24px 28px', borderTop: '1px solid rgba(206,17,38,0.18)' }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 10 }}>Mod Paparan</div>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 4 }}>
          {(['pengguna', 'pakar'] as const).map(v => (
            <button key={v} onClick={() => onView(v)} style={{ flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', border: 'none', cursor: 'pointer', background: view === v ? '#CE1126' : 'transparent', color: view === v ? 'white' : 'rgba(255,255,255,0.35)', transition: 'all 0.2s' }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 18, lineHeight: 1.6 }}>
          Nisab: RM42,047 · Kadar: 2.5%<br />ASB: 2.57% · Forward chaining
        </p>
      </div>
    </aside>
  );
}

function MobileBar({ progress, view, onView }: { progress: number; view: string; onView: (v: 'pengguna' | 'pakar') => void }) {
  return (
    <header style={{ display: 'none', background: '#CE1126', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, transparent 55%, #F9C513 55%)', opacity: 0.9 }} />
      <div style={{ position: 'relative', zIndex: 1, padding: '14px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center' }}>
              <SelangorIcon size={16} />
            </div>
            <div>
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 14, color: 'white' }}>Sistem Pakar Zakat</div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>LZS Selangor</div>
            </div>
          </div>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: 999, padding: 3, gap: 3 }}>
            {(['pengguna', 'pakar'] as const).map(v => (
              <button key={v} onClick={() => onView(v)} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', border: 'none', cursor: 'pointer', background: view === v ? 'white' : 'transparent', color: view === v ? '#CE1126' : 'white', opacity: view === v ? 1 : 0.65 }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '12px 18px 14px', position: 'relative', zIndex: 1 }}>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.22)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'white', borderRadius: 999, transition: 'width 0.4s ease' }} />
        </div>
      </div>
    </header>
  );
}

function HomeScreen({ onSelect }: { onSelect: (t: string) => void }) {
  return (
    <div className="anim-slide" style={{ maxWidth: 520, margin: '0 auto', padding: '52px 24px 40px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CE1126', marginBottom: 18 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F9C513', display: 'inline-block', boxShadow: '0 0 0 3px #FDE9A6' }} />
        Mula Konsultasi
      </div>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 34, lineHeight: 1.15, letterSpacing: '-0.02em', color: '#1A1208', marginBottom: 12 }}>
        Kira zakat anda<br />seperti berbincang dengan amil.
      </h1>
      <p style={{ color: '#7A6A57', fontSize: 14, marginBottom: 40, lineHeight: 1.65, maxWidth: 400 }}>
        Pilih jenis zakat. Sistem akan menaakul bermula dari syarat wajib, langkah demi langkah, mengikut kaedah LZS Selangor.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {TYPES.map(t => <TypeCard key={t.id} type={t} onClick={() => onSelect(t.id)} />)}
      </div>
      <div style={{ marginTop: 36, display: 'flex', gap: 20, color: '#7A6A57', fontSize: 12, flexWrap: 'wrap' }}>
        {['Islam · baligh · berakal', 'Nisab RM42,047', 'Kadar 2.5%'].map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#F9C513', display: 'inline-block' }} />{s}
          </span>
        ))}
      </div>
    </div>
  );
}

function TypeCard({ type, onClick }: { type: typeof TYPES[0]; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ textAlign: 'left', padding: '20px 18px 18px', borderRadius: 18, border: `1.5px solid ${hov ? '#CE1126' : '#EAD9B8'}`, background: 'white', boxShadow: hov ? '0 12px 30px rgba(206,17,38,0.12)' : '0 2px 8px rgba(36,19,7,0.05)', transform: hov ? 'translateY(-2px)' : 'none', transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 36, height: 36, background: '#F9C513', opacity: hov ? 0.7 : 0.35, clipPath: 'polygon(100% 0, 100% 100%, 0 0)', transition: 'opacity 0.2s' }} />
      <div style={{ fontSize: 28, marginBottom: 12 }}>{type.ic}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#1A1208', marginBottom: 5 }}>{type.name}</div>
      <div style={{ fontSize: 12, color: '#7A6A57', lineHeight: 1.45 }}>{type.desc}</div>
    </button>
  );
}

function QuestionCard({ q, onAnswer, onBack }: { q: Question; onAnswer: (qid: string, value: unknown) => void; onBack: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  useEffect(() => { setVals({}); setError(''); }, [q.id]);

  const submit = () => {
    if (q.kind === 'number' && q.field) {
      const val = parseFloat(vals[q.field.k] || '0');
      if (!vals[q.field.k] || vals[q.field.k].trim() === '') {
        setError('Sila isi jumlah sebelum teruskan.');
        return;
      }
      setError('');
      onAnswer(q.id, val || 0);
    } else if (q.kind === 'group' && q.fields) {
      setError('');
      const obj: Record<string, string> = {};
      q.fields.forEach(f => { obj[f.k] = vals[f.k] ?? '0'; });
      onAnswer(q.id, obj);
    }
  };

  return (
    <div className="anim-slide" style={{ maxWidth: 520, margin: '0 auto', padding: '36px 24px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 999, border: '1.5px solid #EAD9B8', background: 'white', color: '#7A6A57', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ← Kembali
        </button>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CE1126' }}>{q.phase}</span>
      </div>

      <div style={{ background: 'white', borderRadius: 22, border: '1.5px solid #EAD9B8', padding: '28px 26px 26px', boxShadow: '0 12px 32px rgba(36,19,7,0.08)' }}>
        <h2 style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 23, lineHeight: 1.25, color: '#1A1208', marginBottom: q.help ? 10 : 22, letterSpacing: '-0.01em' }}>{q.prompt}</h2>
        {q.help && <p style={{ fontSize: 13, color: '#7A6A57', marginBottom: 22, lineHeight: 1.6, background: '#FAFAF8', borderRadius: 10, padding: '10px 14px', border: '1px solid #EAD9B8' }}>{q.help}</p>}

        {q.kind === 'choice' && q.options && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.options.map((opt, i) => <ChoiceBtn key={i} opt={opt} onClick={() => onAnswer(q.id, opt.v)} />)}
          </div>
        )}

        {q.kind === 'number' && q.field && (
          <>
            <NumberInput field={q.field} value={vals[q.field.k] ?? ''} onChange={v => setVals(p => ({ ...p, [q.field!.k]: v }))} onEnter={submit} />
            {error && (
              <p style={{ color: '#CE1126', fontSize: 12.5, fontWeight: 600, marginTop: 8, marginBottom: 0 }}>
                ⚠ {error}
              </p>
            )}
            <PrimaryBtn onClick={submit} label="Seterusnya →" />
          </>
        )}

        {q.kind === 'group' && q.fields && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {q.fields.map(f => (
                <div key={f.k}>
                  {f.l && <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1A1208', marginBottom: 6 }}>{f.l}</label>}
                  <NumberInput field={f} value={vals[f.k] ?? ''} onChange={v => setVals(p => ({ ...p, [f.k]: v }))} onEnter={submit} />
                </div>
              ))}
            </div>
            {error && (
              <p style={{ color: '#CE1126', fontSize: 12.5, fontWeight: 600, marginTop: 8, marginBottom: 0 }}>
                ⚠ {error}
              </p>
            )}
            <PrimaryBtn onClick={submit} label="Seterusnya →" style={{ marginTop: 20 }} />
          </>
        )}
      </div>
    </div>
  );
}

function ChoiceBtn({ opt, onClick }: { opt: { l: string; sub?: string }; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px', borderRadius: 12, border: `1.5px solid ${hov ? '#CE1126' : '#EAD9B8'}`, background: '#FAFAF8', boxShadow: hov ? '0 4px 14px rgba(206,17,38,0.1)' : 'none', transform: hov ? 'translateY(-1px)' : 'none', transition: 'all 0.15s', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 7, border: `1.5px solid ${hov ? '#CE1126' : '#EAD9B8'}`, display: 'grid', placeItems: 'center', color: '#CE1126', fontSize: 12, marginTop: 1 }}>›</span>
      <span>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#1A1208', display: 'block' }}>{opt.l}</span>
        {opt.sub && <span style={{ fontSize: 12, color: '#7A6A57', display: 'block', marginTop: 2 }}>{opt.sub}</span>}
      </span>
    </button>
  );
}

function NumberInput({ field, value, onChange, onEnter }: { field: { k: string; unit?: string }; value: string; onChange: (v: string) => void; onEnter: () => void }) {
  return (
    <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1.5px solid #EAD9B8', background: '#FAFAF8' }}>
      <span style={{ padding: '0 16px', background: '#FDE9A6', color: '#A50D1E', fontWeight: 800, fontSize: 12, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{field.unit ?? 'RM'}</span>
      <input type="number" inputMode="decimal" min={0} step="any" placeholder="0" value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter()}
        autoFocus
        style={{ flex: 1, padding: '13px 16px', background: 'transparent', outline: 'none', border: 'none', fontWeight: 600, fontSize: 15, color: '#1A1208', fontFamily: 'inherit' }} />
    </div>
  );
}

function PrimaryBtn({ onClick, label, style: extra }: { onClick: () => void; label: string; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: '#CE1126', color: 'white', fontWeight: 700, fontSize: 14.5, border: 'none', cursor: 'pointer', boxShadow: '0 8px 20px rgba(206,17,38,0.3)', marginTop: 14, fontFamily: 'inherit', ...extra }}>
      {label}
    </button>
  );
}

function ConfirmScreen({ facts, onConfirm, onBack }: { facts: Facts; onConfirm: () => void; onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const t = facts.zakatType as string;
  const typeLabel: Record<string, string> = { pendapatan: 'Zakat Pendapatan', simpanan: 'Zakat Simpanan', emas: 'Zakat Emas', asb: 'Zakat ASB' };

  const rows: { label: string; value: string }[] = [];
  if (facts.muslim !== undefined) rows.push({ label: 'Muslim', value: facts.muslim ? 'Ya' : 'Tidak' });
  if (facts.halal !== undefined) rows.push({ label: 'Sumber Halal', value: facts.halal ? 'Ya' : 'Tidak' });
  if (facts.haul !== undefined) rows.push({ label: 'Cukup Haul', value: facts.haul ? 'Ya' : 'Tidak' });
  if (facts.method) rows.push({ label: 'Kaedah', value: facts.method === 'kasar' ? 'Pendapatan Kasar' : 'Tolak Had Kifayah' });
  if (facts.incGaji) rows.push({ label: 'Gaji & Upah', value: `RM${Number(facts.incGaji).toLocaleString()}` });
  if (facts.incBebas) rows.push({ label: 'Kerja Bebas', value: `RM${Number(facts.incBebas).toLocaleString()}` });
  if (facts.incSewa) rows.push({ label: 'Sewa', value: `RM${Number(facts.incSewa).toLocaleString()}` });
  if (facts.incBeri) rows.push({ label: 'Pemberian', value: `RM${Number(facts.incBeri).toLocaleString()}` });
  if (facts.kwsp) rows.push({ label: 'KWSP', value: `RM${Number(facts.kwsp).toLocaleString()}` });
  if (facts.th) rows.push({ label: 'Tabung Haji', value: `RM${Number(facts.th).toLocaleString()}` });
  const accounts = (facts.accounts as {type:string;baki:number;faedah:number}[]) ?? [];
  accounts.forEach((a, i) => rows.push({ label: `Akaun ${i+1} (${a.type})`, value: `RM${Number(a.baki).toLocaleString()}` }));
  const goldItems = (facts.goldItems as {kat:string;berat:number;karat:string}[]) ?? [];
  goldItems.forEach((g, i) => rows.push({ label: `Emas ${i+1} (${g.kat})`, value: `${g.berat}g · ${g.karat}K` }));
  if (facts.kaedahAsb) rows.push({ label: 'Kaedah ASB', value: facts.kaedahAsb === 'tradisional' ? 'Tradisional' : 'al-Mustaghallat' });
  if (facts.asbBase) rows.push({ label: 'Baki ASB', value: `RM${Number(facts.asbBase).toLocaleString()}` });
  if (facts.asbNilai) rows.push({ label: 'Nilai ASB', value: `RM${Number(facts.asbNilai).toLocaleString()}` });
  if (facts.asbDiv) rows.push({ label: 'Dividen ASB', value: `RM${Number(facts.asbDiv).toLocaleString()}` });

  return (
    <div className="anim-slide" style={{ maxWidth: 520, margin: '0 auto', padding: '36px 24px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 999, border: '1.5px solid #EAD9B8', background: 'white', color: '#7A6A57', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ← Kembali
        </button>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CE1126' }}>Semak Maklumat</span>
      </div>

      <div style={{ background: 'white', borderRadius: 22, border: '1.5px solid #EAD9B8', overflow: 'hidden', boxShadow: '0 12px 32px rgba(36,19,7,0.08)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #EAD9B8', background: '#FAFAF8' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CE1126', marginBottom: 4 }}>Jenis Zakat</div>
          <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 20, color: '#1A1208' }}>{typeLabel[t] ?? t}</div>
        </div>

        <div style={{ padding: '8px 0' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 24px', borderBottom: i < rows.length - 1 ? '1px dashed #EAD9B8' : 'none' }}>
              <span style={{ fontSize: 13, color: '#7A6A57', fontWeight: 500 }}>{r.label}</span>
              <span style={{ fontSize: 13, color: '#1A1208', fontWeight: 700 }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#7A6A57', margin: '20px 0 16px', lineHeight: 1.6, textAlign: 'center' }}>
        Semak maklumat di atas. Tekan <strong>Kira Zakat</strong> untuk dapatkan keputusan.
      </p>

      <button onClick={() => { setLoading(true); setTimeout(onConfirm, 800); }} disabled={loading}
        style={{ display: 'block', width: '100%', padding: '14px 0', borderRadius: 14, background: loading ? '#7A6A57' : '#CE1126', color: 'white', fontWeight: 700, fontSize: 14.5, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 8px 20px rgba(206,17,38,0.3)', fontFamily: 'inherit', transition: 'all 0.3s' }}>
        {loading ? '⏳ Sistem sedang menaakul...' : 'Kira Zakat →'}
      </button>
    </div>
  );
}

function ResultScreen({ result, view, onReset, onBack }: { result: ZakatResult; view: 'pengguna' | 'pakar'; onReset: () => void; onBack: () => void }) {
  const wajib = result.status === 'WAJIB';

  const handleDownloadPDF = async () => {
    const element = document.getElementById('result-content');
    if (!element) return;
    try {
      const canvas = await html2canvas(element, { 
        scale: 2, 
        backgroundColor: '#FAFAF8',
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ 
        orientation: 'portrait', 
        unit: 'mm', 
        format: 'a4' 
      });
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save('zakat-selangor.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  return (
    <div className="anim-slide" style={{ maxWidth: 560, margin: '0 auto', padding: '36px 24px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 999, border: '1.5px solid #EAD9B8', background: 'white', color: '#7A6A57', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Kembali</button>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CE1126' }}>Keputusan</span>
        <button onClick={handleDownloadPDF} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 999, border: '1.5px solid #CE1126', background: '#CE1126', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          PDF
        </button>
      </div>

      <div id="result-content">
        <div style={{ borderRadius: 22, overflow: 'hidden', position: 'relative', background: wajib ? 'linear-gradient(135deg, #1B7A43 0%, #0F4A28 100%)' : 'linear-gradient(135deg, #A50D1E 0%, #0D0304 100%)', boxShadow: wajib ? '0 24px 48px rgba(27,122,67,0.28)' : '0 24px 48px rgba(165,13,30,0.28)' }}>
          <div style={{ position: 'absolute', right: -28, top: -28, opacity: 0.07 }}>
            <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
              <circle cx="90" cy="90" r="82" stroke="white" strokeWidth="4"/>
              <circle cx="128" cy="68" r="62" fill="black"/>
            </svg>
          </div>
          <div style={{ padding: '32px 30px', position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 14 }}>
              {wajib ? 'Zakat Diwajibkan' : 'Tidak Dikenakan Zakat'}
            </div>
            {wajib && result.payable !== undefined ? (
              <>
                <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 800, fontSize: 50, color: 'white', lineHeight: 1, letterSpacing: '-0.02em' }}>{money(result.payable)}</div>
                <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                  setahun {result.monthly && <> · <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{money(result.monthly)}</span> sebulan</>}
                </div>
              </>
            ) : (
              <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 22, color: 'white', lineHeight: 1.25 }}>{result.reason || 'Tidak diwajibkan zakat'}</div>
            )}
          </div>
        </div>

        {/* Nisab Indicator */}
        <div style={{ background: 'white', borderRadius: 18, border: '1.5px solid #EAD9B8', padding: '16px 20px', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A6A57', marginBottom: 4 }}>Nisab Semasa</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1208' }}>RM42,047.00</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7A6A57', marginBottom: 4 }}>
              {wajib ? 'Lebihan Nisab' : 'Kekurangan Nisab'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: wajib ? '#1B7A43' : '#CE1126' }}>
              {result.payable !== undefined && wajib
                ? `+ RM${((result.payable / 0.025) - 42047).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
                : result.how.length > 0 ? '< RM42,047' : '-'
              }
            </div>
          </div>
        </div>

        {result.how.length > 0 && (
          <div style={{ background: 'white', borderRadius: 18, border: '1.5px solid #EAD9B8', overflow: 'hidden', marginTop: 14 }}>
            <div style={{ padding: '13px 20px', borderBottom: '1px solid #EAD9B8', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CE1126' }}>Pengiraan Zakat</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: '4px 20px 14px' }}>
              {result.how.map((step, i) => (
                <li key={i} style={{ padding: '9px 0 9px 22px', fontSize: 13, borderBottom: i < result.how.length - 1 ? '1px dashed #EAD9B8' : 'none', position: 'relative', color: '#1A1208', lineHeight: 1.55 }}>
                  <span style={{ position: 'absolute', left: 4, top: 16, width: 9, height: 9, borderRadius: '50%', background: '#F9C513' }} />{step}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.why.length > 0 && (
          <div style={{ background: 'white', borderRadius: 18, border: '1.5px solid #EAD9B8', overflow: 'hidden', marginTop: 14 }}>
            <div style={{ padding: '13px 20px', borderBottom: '1px solid #EAD9B8', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CE1126' }}>Kenapa Keputusan Ini?</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: '4px 20px 14px' }}>
              {result.why.map((w, i) => (
                <li key={i} style={{ padding: '9px 0 9px 22px', fontSize: 13, borderBottom: i < result.why.length - 1 ? '1px dashed #EAD9B8' : 'none', position: 'relative', color: '#1A1208' }}>
                  <span style={{ position: 'absolute', left: 4, top: 14, width: 9, height: 9, borderRadius: '50%', background: '#CE1126' }} />{w.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === 'pakar' && (
          <div style={{ background: 'white', borderRadius: 18, border: '1.5px solid #EAD9B8', overflow: 'hidden', marginTop: 14 }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid #EAD9B8', background: '#FAFAF8' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CE1126' }}>Jejak Penaakulan</div>
              <p style={{ fontSize: 12, color: '#7A6A57', marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
                Urutan peraturan yang digunakan sistem untuk sampai kepada keputusan ini.
              </p>
            </div>
            <div style={{ padding: '12px 18px' }}>
              {result.cycles.map((c, idx) => (
                <div key={c.cycle} style={{ display: 'flex', gap: 14, marginBottom: idx < result.cycles.length - 1 ? 16 : 0 }}>
                  {/* Left — number + line */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#CE1126', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{c.cycle}</div>
                    {idx < result.cycles.length - 1 && (
                      <div style={{ width: 2, flex: 1, background: '#EAD9B8', marginTop: 4, minHeight: 20 }} />
                    )}
                  </div>
                  {/* Right — content */}
                  <div style={{ flex: 1, paddingBottom: idx < result.cycles.length - 1 ? 16 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: '#CE1126', fontSize: 13 }}>{c.fired}</span>
                      <span style={{ background: '#FDE9A6', color: '#A50D1E', borderRadius: 999, padding: '1px 8px', fontSize: 10.5, fontWeight: 700 }}>salience {c.salience}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#1A1208', marginBottom: 8, lineHeight: 1.5 }}>{c.because}</div>
                    {Object.keys(c.asserted).length > 0 && (
                      <div style={{ background: '#FAFAF8', borderRadius: 10, padding: '10px 12px', border: '1px solid #EAD9B8' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7A6A57', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fakta baru diperoleh</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {Object.entries(c.asserted).map(([k, v]) => {
                            const labels: Record<string, (v: unknown) => string> = {
                              eligible:         () => 'Layak zakat ✓',
                              incomeAdmissible: () => 'Pendapatan boleh dinilai ✓',
                              nisabSatisfied:   () => 'Nisab dipenuhi ✓',
                              zakatObligatory:  () => 'Zakat WAJIB ✓',
                              conclusion:       (v) => v === 'WAJIB' ? '✅ Keputusan: WAJIB' : '❌ Keputusan: TIDAK',
                              assessableAmount: (v) => `Jumlah dinilai: RM${Number(v).toLocaleString('en-MY', {minimumFractionDigits:2})}`,
                              nisabTestValue:   (v) => `Nilai semakan nisab: RM${Number(v).toLocaleString('en-MY', {minimumFractionDigits:2})}`,
                              payableBase:      (v) => `Asas pengiraan: RM${Number(v).toLocaleString('en-MY', {minimumFractionDigits:2})}`,
                              payableAmount:    (v) => `Zakat perlu dibayar: RM${Number(v).toLocaleString('en-MY', {minimumFractionDigits:2})}`,
                              applicableRate:   (v) => `Kadar: ${(Number(v)*100).toFixed(2).replace(/\.?0+$/,'')}%`,
                              nisabBasis:       (v) => `Asas nisab: ${v === 'rm' ? 'Wang Ringgit' : 'Emas'}`,
                              monthly:          (v) => `Bayaran bulanan: RM${Number(v).toLocaleString('en-MY', {minimumFractionDigits:2})}`,
                              reason:           (v) => `Sebab: ${v}`,
                              goldWornZ:        (v) => `Nilai emas perhiasan: RM${Number(v).toLocaleString('en-MY', {minimumFractionDigits:2})}`,
                              goldStoredZ:      (v) => `Nilai emas simpanan: RM${Number(v).toLocaleString('en-MY', {minimumFractionDigits:2})}`,
                              goldPawnedZ:      (v) => `Nilai emas cagar: RM${Number(v).toLocaleString('en-MY', {minimumFractionDigits:2})}`,
                            };
                            const display = labels[k] ? labels[k](v) : `${k} = ${String(v)}`;
                            return (
                              <span key={k} style={{ background: 'white', border: '1px solid #EAD9B8', color: '#1A1208', borderRadius: 8, padding: '3px 10px', fontSize: 11.5, fontWeight: 600 }}>
                                {display}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {c.ref && <div style={{ fontSize: 11, color: '#7A6A57', marginTop: 6 }}>📚 {c.ref}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button onClick={handleDownloadPDF} style={{ display: 'block', width: '100%', marginTop: 20, padding: '14px 0', borderRadius: 14, background: 'white', color: '#CE1126', fontWeight: 700, fontSize: 14.5, border: '2px solid #CE1126', cursor: 'pointer', fontFamily: 'inherit' }}>
        ⬇ Muat Turun PDF
      </button>

      <a href={wajib ? 'https://www.zakat.com.my/perkhidmatan/pembayaran-zakat/' : 'https://www.zakat.com.my'} target="_blank" rel="noopener noreferrer"
        style={{ display: 'block', width: '100%', marginTop: 20, padding: '14px 0', borderRadius: 14, background: wajib ? '#1B7A43' : '#1A4B8C', color: 'white', fontWeight: 700, fontSize: 14.5, border: 'none', cursor: 'pointer', boxShadow: wajib ? '0 8px 20px rgba(27,122,67,0.28)' : '0 8px 20px rgba(26,75,140,0.28)', fontFamily: 'inherit', textAlign: 'center', textDecoration: 'none' }}>
        {wajib ? '💳 Bayar Zakat di LZS →' : '🌐 Lawati Lembaga Zakat Selangor →'}
      </a>

      <button onClick={onReset} style={{ display: 'block', width: '100%', marginTop: 12, padding: '14px 0', borderRadius: 14, background: '#CE1126', color: 'white', fontWeight: 700, fontSize: 14.5, border: 'none', cursor: 'pointer', boxShadow: '0 8px 20px rgba(206,17,38,0.28)', fontFamily: 'inherit' }}>
        ↺ Kira Zakat Lain
      </button>
      
      <p style={{ textAlign: 'center', fontSize: 11.5, color: '#7A6A57', marginTop: 22, lineHeight: 1.65 }}>Untuk rujukan sahaja. Sila sahkan dengan Lembaga Zakat Selangor.</p>
    </div>
  );
}

export default function ZakatWizard() {
  const [s, dispatch] = useReducer(reducer, INIT);
  const currentQ = s.screen === 'question' ? Consult.next(s.facts) : null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar phase={phaseIdx(s.screen, currentQ)} view={s.view} onView={v => dispatch({ type: 'SET_VIEW', view: v })} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#FAFAF8', minWidth: 0 }}>
        <MobileBar progress={pct(s.screen, s.history.length)} view={s.view} onView={v => dispatch({ type: 'SET_VIEW', view: v })} />
        <div className="hidden lg:block" style={{ height: 3, background: '#EAD9B8' }}>
          <div style={{ height: '100%', width: `${pct(s.screen, s.history.length)}%`, background: '#CE1126', transition: 'width 0.45s ease' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }} key={s.animKey}>
          {s.screen === 'home' && <HomeScreen onSelect={t => dispatch({ type: 'SELECT_TYPE', zakatType: t })} />}
          {s.screen === 'question' && currentQ && <QuestionCard q={currentQ} onAnswer={(qid, value) => dispatch({ type: 'ANSWER', qid, value })} onBack={() => dispatch({ type: 'BACK' })} />}
          {s.screen === 'confirm' && <ConfirmScreen facts={s.facts} onConfirm={() => dispatch({ type: 'CONFIRM' })} onBack={() => dispatch({ type: 'BACK' })} />}
          {s.screen === 'result' && s.result && <ResultScreen result={s.result} view={s.view} onReset={() => dispatch({ type: 'RESET' })} onBack={() => dispatch({ type: 'BACK' })} />}
        </div>
      </div>
    </div>
  );
}