import { PARAMS } from './params';

export interface ExplFn { calc: (step: string) => void; }

export interface GoldItem {
  kat:      'perhiasan' | 'simpanan' | 'cagar';
  berat:    number;
  karat:    string;
  pinjaman: number;
  upah:     number;
}

export interface SavingsAccount {
  type:    'konvensional' | 'wadiah';
  baki:    number;
  faedah:  number;
}

export function money(x: number | undefined): string {
  return 'RM' + (Math.round((Number(x) || 0) * 100) / 100)
    .toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(x: unknown): number {
  const v = parseFloat(String(x));
  return isNaN(v) ? 0 : v;
}

function _goldTotals(items: GoldItem[], kat: string) {
  let W = 0, V = 0, loan = 0, fee = 0;
  items.forEach(it => {
    if (it.kat !== kat) return;
    W += num(it.berat);
    V += num(it.berat) * (PARAMS.GOLD_PRICE[String(it.karat)] || 0);
    loan += num(it.pinjaman);
    fee  += num(it.upah);
  });
  return { W, V, loan, fee };
}

export const Calc = {
  incomeAssessable(f: Record<string, unknown>, expl: ExplFn): number {
    const A1 = num(f.incGaji), A2 = num(f.incBebas),
          A3 = num(f.incSewa), A4 = num(f.incBeri);
    const A = A1 + A2 + A3 + A4;
    expl.calc(`Jumlah pendapatan A = ${money(A1)} + ${money(A2)} + ${money(A3)} + ${money(A4)} = ${money(A)}`);
    if (f.method === 'kasar') {
      expl.calc(`Kaedah kasar → pendapatan layak zakat = ${money(A)}`);
      return A;
    }
    const hk = PARAMS.HAD_KIFAYAH;
    const B = hk.ketua
      + hk.dewasaKerja * num(f.hkDewasaKerja)
      + hk.dewasaTak   * num(f.hkDewasaTak)
      + hk.ipt         * num(f.hkIpt)
      + hk.anak7_17    * num(f.hkAnak7_17)
      + hk.anak6       * num(f.hkAnak6)
      + hk.oku         * num(f.hkOku)
      + hk.kronik      * num(f.hkKronik)
      + hk.jagaan      * num(f.hkJagaan);
    const C = num(f.kwsp), D = num(f.th);
    expl.calc(`Had Kifayah B = ketua ${money(hk.ketua)} + tanggungan = ${money(B)}`);
    expl.calc(`Tolak KWSP = ${money(C)} · Tabung Haji = ${money(D)}`);
    const taxable = A - B - C - D;
    expl.calc(`Pendapatan layak zakat = A − B − KWSP − TH = ${money(taxable)}`);
    return taxable;
  },

  savingsAssessable(accounts: SavingsAccount[], expl: ExplFn): number {
    let total = 0;
    accounts.forEach((a, i) => {
      const ded = a.type === 'konvensional' ? num(a.faedah) : 0;
      const net = num(a.baki) - ded;
      total += net;
      const extra = ded ? ` − faedah ${money(ded)}` : '';
      expl.calc(`Akaun ${i + 1} (${a.type}): baki ${money(a.baki)}${extra} = ${money(net)}`);
    });
    if (accounts.length > 1)
      expl.calc(`Jumlah baki terendah semua akaun = ${money(total)}`);
    return total;
  },

  goldWorn(items: GoldItem[], expl: ExplFn): number {
    const { W, V } = _goldTotals(items, 'perhiasan');
    const z = W > PARAMS.URUF_G ? V * (1 - PARAMS.URUF_G / W) : 0;
    const tag = W > PARAMS.URUF_G ? '− uruf 800g' : '(≤800g, dalam uruf → 0)';
    expl.calc(`Emas perhiasan: ${W}g bernilai ${money(V)} ${tag} → kena zakat ${money(z)}`);
    return z;
  },

  goldStored(items: GoldItem[], expl: ExplFn): number {
    const { W, V } = _goldTotals(items, 'simpanan');
    const z = W >= PARAMS.NISAB_GOLD_G ? V : 0;
    const tag = W >= PARAMS.NISAB_GOLD_G ? '(≥85g)' : '(<85g, bawah nisab → 0)';
    expl.calc(`Emas simpanan: ${W}g bernilai ${money(V)} ${tag} → kena zakat ${money(z)}`);
    return z;
  },

  goldPawned(items: GoldItem[], expl: ExplFn): number {
    const { W, V, loan, fee } = _goldTotals(items, 'cagar');
    const net = V - loan - fee;
    const z = (W >= PARAMS.NISAB_GOLD_G && net > 0) ? net : 0;
    expl.calc(`Emas cagar: ${W}g, nilai bersih ${money(net)} → kena zakat ${money(z)}`);
    return z;
  },

  goldCombine(parts: number[], expl: ExplFn): number {
    const total = parts.reduce((a, b) => a + b, 0);
    if (parts.filter(p => p > 0).length > 1)
      expl.calc(`Jumlah nilai emas (gabung semua kategori) = ${money(total)}`);
    return total;
  },

  asbTraditional(base: unknown, expl: ExplFn): number {
    expl.calc(`Baki terendah (modal + dividen) = ${money(num(base))}`);
    return num(base);
  },

  payable(assessable: unknown, rate: number | undefined, expl: ExplFn): number {
    const r = rate ?? PARAMS.RATE;
    const z = num(assessable) * r;
    expl.calc(`Zakat = ${money(num(assessable))} × ${(r * 100).toFixed(2).replace(/\.?0+$/, '')}% = ${money(z)}`);
    return z;
  },
};