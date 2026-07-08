import { PARAMS } from './params';
import { Calc, type ExplFn, type GoldItem, type SavingsAccount } from './calc';
import type { WM, WMValue } from './workingMemory';

export function round2(x: unknown): number {
  return Math.round((Number(x) || 0) * 100) / 100;
}

export interface CycleLog {
  cycle:    number;
  agenda:   string[];
  fired:    string;
  salience: number;
  because:  string;
  ref:      string;
  asserted: Record<string, WMValue>;
}

export interface Explanation extends ExplFn {
  cycles:    CycleLog[];
  calcSteps: string[];
  logCycle(n: number, agendaIds: string[], rule: Rule, asserted: Record<string, WMValue>): void;
  firedSequence(): string[];
  why():  { rule: string; text: string; facts: Record<string, WMValue> }[];
  how():  string[];
}

export function newExplanation(): Explanation {
  return {
    cycles: [], calcSteps: [],
    logCycle(n, agendaIds, rule, asserted) {
      this.cycles.push({ cycle: n, agenda: agendaIds, fired: rule.id, salience: rule.salience, because: rule.desc, ref: rule.ref, asserted });
    },
    calc(step) { this.calcSteps.push(step); },
    firedSequence() { return this.cycles.map(c => c.fired); },
    why()  { return this.cycles.filter(c => Object.keys(c.asserted).length).map(c => ({ rule: c.fired, text: c.because, facts: c.asserted })); },
    how()  { return this.calcSteps; },
  };
}

export interface Rule {
  id:       string;
  salience: number;
  cond:     (wm: WM) => boolean;
  act:      (wm: WM, expl: Explanation) => void;
  desc:     string;
  ref:      string;
}

export function buildRules(): Rule[] {
  const hasGoldKat = (wm: WM, kat: string) =>
    ((wm.value('goldItems', []) as GoldItem[]) || []).some(it => it.kat === kat);

  return [
    { id: 'R001', salience: 100,
      cond: wm => wm.isTrue('muslim') && !wm.has('eligible'),
      act:  wm => { wm.assertFact('eligible', true, 'R001'); },
      desc: 'Pembayar seorang Muslim → layak untuk zakat.',
      ref:  'JAWHAR Manual, syarat wajib (Islam)' },

    { id: 'R002', salience: 100,
      cond: wm => wm.value('muslim') === false && !wm.has('conclusion'),
      act:  wm => {
        wm.assertFact('eligible',   false,           'R002');
        wm.assertFact('reason',     'Bukan beragama Islam', 'R002');
        wm.assertFact('conclusion', 'TIDAK',         'R002');
      },
      desc: 'Bukan Muslim → zakat tidak diwajibkan.',
      ref:  'Syarat wajib: Islam' },

    { id: 'R003', salience: 95,
      cond: wm => wm.value('zakatType') === 'pendapatan' && wm.value('halal') === false && !wm.has('conclusion'),
      act:  wm => {
        wm.assertFact('reason',     'Sumber pendapatan tidak halal', 'R003');
        wm.assertFact('conclusion', 'TIDAK', 'R003');
      },
      desc: 'Sumber pendapatan tidak halal → tidak dizakatkan.',
      ref:  'Fatwa Selangor: harta haram' },

    { id: 'R004', salience: 95,
      cond: wm => ['simpanan','emas','asb'].includes(String(wm.value('zakatType'))) && wm.value('haul') === false && !wm.has('conclusion'),
      act:  wm => {
        wm.assertFact('reason',     'Belum cukup haul (genap setahun)', 'R004');
        wm.assertFact('conclusion', 'TIDAK', 'R004');
      },
      desc: 'Belum cukup haul → syarat wajib tidak dipenuhi.',
      ref:  'Syarat wajib: haul' },

    { id: 'R005', salience: 80,
      cond: wm => wm.isTrue('eligible') && wm.value('zakatType') === 'pendapatan' && wm.isTrue('halal') && !wm.has('incomeAdmissible') && !wm.has('conclusion'),
      act:  wm => { wm.assertFact('incomeAdmissible', true, 'R005'); },
      desc: 'Layak + sumber halal → pendapatan boleh dinilai.',
      ref:  'LZS Zakat Pendapatan' },

    { id: 'R006', salience: 70,
      cond: wm => wm.isTrue('incomeAdmissible') && !wm.has('payableBase') && !wm.has('conclusion'),
      act:  (wm, expl) => {
        const val = Calc.incomeAssessable(wm.snapshot() as Record<string, unknown>, expl);
        wm.assertFact('assessableAmount', round2(val), 'R006');
        wm.assertFact('nisabTestValue',   round2(val), 'R006');
        wm.assertFact('payableBase',      round2(val), 'R006');
        wm.assertFact('applicableRate',   PARAMS.RATE, 'R006');
        wm.assertFact('nisabBasis',       'rm',        'R006');
      },
      desc: 'Kira pendapatan layak zakat (kasar / bersih selepas Had Kifayah).',
      ref:  'LZS Zakat Pendapatan; Had Kifayah' },

    { id: 'R007', salience: 80,
      cond: wm => wm.isTrue('eligible') && wm.value('zakatType') === 'simpanan' && wm.isTrue('haul') && !wm.has('payableBase') && !wm.has('conclusion'),
      act:  (wm, expl) => {
        const val = Calc.savingsAssessable((wm.value('accounts', []) as SavingsAccount[]) || [], expl);
        wm.assertFact('assessableAmount', round2(val), 'R007');
        wm.assertFact('nisabTestValue',   round2(val), 'R007');
        wm.assertFact('payableBase',      round2(val), 'R007');
        wm.assertFact('applicableRate',   PARAMS.RATE, 'R007');
        wm.assertFact('nisabBasis',       'rm',        'R007');
      },
      desc: 'Gabung baki terendah semua akaun → jumlah simpanan dizakatkan.',
      ref:  'LZS Zakat Wang Simpanan' },

    { id: 'R008', salience: 84,
      cond: wm => wm.isTrue('eligible') && wm.value('zakatType') === 'emas' && wm.isTrue('haul') && hasGoldKat(wm, 'perhiasan') && !wm.has('goldWornZ') && !wm.has('conclusion'),
      act:  (wm, expl) => {
        wm.assertFact('goldWornZ', round2(Calc.goldWorn((wm.value('goldItems', []) as GoldItem[]) || [], expl)), 'R008');
      },
      desc: 'Emas perhiasan dipakai: nilai ikut karat, tolak uruf 800g.',
      ref:  'LZS Zakat Emas; Fatwa uruf 800g' },

    { id: 'R009', salience: 83,
      cond: wm => wm.isTrue('eligible') && wm.value('zakatType') === 'emas' && wm.isTrue('haul') && hasGoldKat(wm, 'simpanan') && !wm.has('goldStoredZ') && !wm.has('conclusion'),
      act:  (wm, expl) => {
        wm.assertFact('goldStoredZ', round2(Calc.goldStored((wm.value('goldItems', []) as GoldItem[]) || [], expl)), 'R009');
      },
      desc: 'Emas simpanan: nilai penuh jika berat ≥ 85g.',
      ref:  'LZS Zakat Emas; nisab 85g' },

    { id: 'R010', salience: 82,
      cond: wm => wm.isTrue('eligible') && wm.value('zakatType') === 'emas' && wm.isTrue('haul') && hasGoldKat(wm, 'cagar') && !wm.has('goldPawnedZ') && !wm.has('conclusion'),
      act:  (wm, expl) => {
        wm.assertFact('goldPawnedZ', round2(Calc.goldPawned((wm.value('goldItems', []) as GoldItem[]) || [], expl)), 'R010');
      },
      desc: 'Emas dicagar: nilai bersih selepas tolak pinjaman & upah.',
      ref:  'LZS Zakat Emas' },

    { id: 'R011', salience: 75,
      cond: wm => wm.value('zakatType') === 'emas' && wm.isTrue('haul') && (wm.has('goldWornZ') || wm.has('goldStoredZ') || wm.has('goldPawnedZ')) && !wm.has('payableBase') && !wm.has('conclusion'),
      act:  (wm, expl) => {
        const parts = [wm.value('goldWornZ', 0) as number, wm.value('goldStoredZ', 0) as number, wm.value('goldPawnedZ', 0) as number];
        const total = Calc.goldCombine(parts, expl);
        wm.assertFact('assessableAmount', round2(total), 'R011');
        wm.assertFact('payableBase',      round2(total), 'R011');
        wm.assertFact('applicableRate',   PARAMS.RATE,   'R011');
        wm.assertFact('nisabBasis',       'gold',        'R011');
      },
      desc: 'Gabungkan nilai semua kategori emas.',
      ref:  'LZS Zakat Emas (jumlah keseluruhan)' },

    { id: 'R012', salience: 80,
      cond: wm => wm.isTrue('eligible') && wm.value('zakatType') === 'asb' && wm.isTrue('haul') && wm.value('kaedahAsb') === 'tradisional' && !wm.has('payableBase') && !wm.has('conclusion'),
      act:  (wm, expl) => {
        const base = Calc.asbTraditional(wm.value('asbBase'), expl);
        wm.assertFact('assessableAmount', round2(base), 'R012');
        wm.assertFact('nisabTestValue',   round2(base), 'R012');
        wm.assertFact('payableBase',      round2(base), 'R012');
        wm.assertFact('applicableRate',   PARAMS.RATE,  'R012');
        wm.assertFact('nisabBasis',       'rm',         'R012');
      },
      desc: 'ASB tradisional: baki terendah × 2.5%.',
      ref:  'LZS Zakat Saham/Pelaburan' },

    { id: 'R013', salience: 80,
      cond: wm => wm.isTrue('eligible') && wm.value('zakatType') === 'asb' && wm.isTrue('haul') && wm.value('kaedahAsb') === 'mustaghallat' && !wm.has('payableBase') && !wm.has('conclusion'),
      act:  (wm, expl) => {
        const nilai = wm.value('asbNilai') as number;
        const div   = wm.value('asbDiv');
        const n = (x: unknown) => { const v = parseFloat(String(x)); return isNaN(v) ? 0 : v; };
        const m = (x: number)  => 'RM' + (Math.round(x * 100) / 100).toLocaleString('en-MY', { minimumFractionDigits: 2 });
        expl.calc(`Nilai pelaburan (semakan nisab) = ${m(n(nilai))}`);
        wm.assertFact('nisabTestValue', round2(nilai),    'R013');
        wm.assertFact('payableBase',    round2(n(div)),   'R013');
        wm.assertFact('applicableRate', PARAMS.RATE_ASB,  'R013');
        wm.assertFact('nisabBasis',     'rm',             'R013');
      },
      desc: 'ASB al-Mustaghallat: nisab atas nilai pelaburan; zakat atas dividen × 2.57%.',
      ref:  'Fatwa Selangor 2025 (al-Mustaghallat)' },

    { id: 'R014', salience: 60,
      cond: wm => wm.has('nisabTestValue') && wm.value('nisabBasis') === 'rm' && (wm.value('nisabTestValue') as number) >= PARAMS.NISAB_RM && !wm.has('nisabSatisfied') && !wm.has('conclusion'),
      act:  wm => { wm.assertFact('nisabSatisfied', true, 'R014'); },
      desc: 'Jumlah harta ≥ nisab (RM) → nisab dipenuhi.',
      ref:  'LZS: nisab = nilai 85g emas' },

    { id: 'R015', salience: 60,
      cond: wm => wm.has('nisabTestValue') && wm.value('nisabBasis') === 'rm' && (wm.value('nisabTestValue') as number) < PARAMS.NISAB_RM && !wm.has('conclusion'),
      act:  wm => {
        wm.assertFact('reason',     'Belum mencapai nisab', 'R015');
        wm.assertFact('conclusion', 'TIDAK',                'R015');
      },
      desc: 'Jumlah harta < nisab → tidak wajib.',
      ref:  'LZS: nisab' },

    { id: 'R016', salience: 60,
      cond: wm => wm.value('nisabBasis') === 'gold' && (wm.value('payableBase', 0) as number) > 0 && !wm.has('nisabSatisfied') && !wm.has('conclusion'),
      act:  wm => { wm.assertFact('nisabSatisfied', true, 'R016'); },
      desc: 'Emas: ada nilai melebihi uruf / nisab → nisab dipenuhi.',
      ref:  'LZS Zakat Emas' },

    { id: 'R017', salience: 60,
      cond: wm => wm.value('nisabBasis') === 'gold' && (wm.value('payableBase', 0) as number) <= 0 && !wm.has('conclusion'),
      act:  wm => {
        wm.assertFact('reason',     'Tidak cukup nisab / dalam uruf 800g', 'R017');
        wm.assertFact('conclusion', 'TIDAK', 'R017');
      },
      desc: 'Emas: tiada nilai mencapai nisab → tidak wajib.',
      ref:  'LZS Zakat Emas' },

    { id: 'R018', salience: 50,
      cond: wm => wm.isTrue('eligible') && wm.isTrue('nisabSatisfied') && !wm.has('zakatObligatory') && !wm.has('conclusion'),
      act:  wm => { wm.assertFact('zakatObligatory', true, 'R018'); },
      desc: 'Layak + nisab dipenuhi → zakat WAJIB.',
      ref:  'Syarat wajib lengkap' },

    { id: 'R019', salience: 40,
      cond: wm => wm.isTrue('zakatObligatory') && !wm.has('payableAmount'),
      act:  (wm, expl) => {
        const z = Calc.payable(wm.value('payableBase'), wm.value('applicableRate') as number | undefined, expl);
        wm.assertFact('payableAmount', round2(z), 'R019');
        wm.assertFact('conclusion',    'WAJIB',   'R019');
      },
      desc: 'Kira zakat = harta layak × kadar.',
      ref:  'LZS: kadar 2.5% / 2.57%' },

    { id: 'R020', salience: 30,
      cond: wm => wm.value('zakatType') === 'pendapatan' && wm.has('payableAmount') && !wm.has('monthly'),
      act:  wm => {
        wm.assertFact('monthly', round2((wm.value('payableAmount') as number) / 12), 'R020');
      },
      desc: 'Pecahan bulanan = zakat tahunan ÷ 12.',
      ref:  'LZS: bayaran bulanan' },
  ];
}