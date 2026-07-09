import { newWM, type WMValue } from './workingMemory';
import { buildRules, newExplanation, type Explanation, type CycleLog } from './rules';

export interface ZakatResult {
  status: 'WAJIB' | 'TIDAK';
  reason: string;
  payable: number | undefined;
  monthly: number | undefined;
  firedRules: string[];
  why: { rule: string; text: string; facts: Record<string, unknown> }[];
  how: string[];
  cycles: CycleLog[];
}

function runInference(
  wm: ReturnType<typeof newWM>,
  rules: ReturnType<typeof buildRules>,
  expl: Explanation,
  maxCycles = 200,
) {
  const fired = new Set<string>();
  let cycle = 0;
  while (cycle < maxCycles) {
    cycle++;
    const agenda = rules.filter(r => !fired.has(r.id) && r.cond(wm));
    if (!agenda.length) break;
    agenda.sort((a, b) => b.salience - a.salience);
    const rule = agenda[0];
    const before = wm.snapshot();
    rule.act(wm, expl);
    const after = wm.snapshot();
    const asserted: Record<string, WMValue> = {};
    for (const k in after) {
      if (!(k in before) || before[k] !== after[k]) asserted[k] = after[k];
    }
    fired.add(rule.id);
    expl.logCycle(cycle, agenda.map(r => r.id), rule, asserted);
  }
}

const USER_FACTS = [
  'muslim', 'zakatType', 'halal', 'haul', 'method',
  'incGaji', 'incBebas', 'incSewa', 'incBeri',
  'hkDewasaKerja', 'hkDewasaTak', 'hkIpt', 'hkAnak7_17',
  'hkAnak6', 'hkOku', 'hkKronik', 'hkJagaan',
  'kwsp', 'th',
  'accounts', 'goldItems',
  'kelasAsb', 'asbNilai', 'asbDiv', // changed from kaedahAsb, asbBase
];

export function reason(consultFacts: Record<string, unknown>): ZakatResult {
  const wm = newWM();
  const expl = newExplanation();
  USER_FACTS.forEach(k => {
    if (k in consultFacts) wm.assertFact(k, consultFacts[k] as never, 'USER');
  });
  runInference(wm, buildRules(), expl);
  const snap = wm.snapshot();
  return {
    status: (snap.conclusion as 'WAJIB' | 'TIDAK') ?? 'TIDAK',
    reason: (snap.reason as string) ?? '',
    payable: snap.payableAmount as number | undefined,
    monthly: snap.monthly as number | undefined,
    firedRules: expl.firedSequence(),
    why: expl.why(),
    how: expl.how(),
    cycles: expl.cycles,
  };
}