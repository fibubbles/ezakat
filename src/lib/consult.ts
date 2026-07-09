export type Facts = Record<string, unknown>;

export interface Option {
  v: unknown;
  l: string;
  sub?: string;
}
export interface Field {
  k: string;
  l?: string;
  unit?: string;
}

export interface Question {
  id: string;
  kind: "choice" | "number" | "group";
  prompt: string;
  phase: string;
  help?: string;
  options?: Option[];
  fields?: Field[];
  field?: Field;
}

export const TYPES = [
  { id: "pendapatan", ic: "💼", name: "Zakat Pendapatan", desc: "Gaji, bonus, komisen, sewa, kerja bebas" },
  { id: "simpanan", ic: "🏦", name: "Zakat Simpanan", desc: "Gabungan baki terendah semua akaun" },
  { id: "emas", ic: "🪙", name: "Zakat Emas", desc: "Emas simpanan, perhiasan & cagaran" },
  { id: "asb", ic: "📈", name: "Zakat ASB", desc: "Pelaburan ASB / ASNB" },
];

function num(x: unknown): number {
  const v = parseFloat(String(x));
  return isNaN(v) ? 0 : v;
}

function Q(id: string, kind: Question["kind"], prompt: string, phase: string, extra?: Partial<Question>): Question {
  return { id, kind, prompt, phase, ...extra };
}

export const Consult = {
  next(f: Facts): Question | null {
    const t = f.zakatType as string;
    if (!("muslim" in f))
      return Q("muslim", "choice", "Adakah anda seorang Muslim?", "Syarat Wajib", {
        help: "Zakat diwajibkan ke atas individu Muslim sahaja.",
        options: [
          { v: true, l: "Ya, saya Muslim" },
          { v: false, l: "Tidak" },
        ],
      });
    if (f.muslim === false) return null;
    if (t === "pendapatan" && f.halal === false) return null;
    if (["simpanan", "emas", "asb"].includes(t) && f.haul === false) return null;
    if (t === "pendapatan") return this._income(f);
    if (t === "simpanan") return this._savings(f);
    if (t === "emas") return this._gold(f);
    if (t === "asb") return this._asb(f);
    return null;
  },

  _income(f: Facts): Question | null {
    if (!("halal" in f))
      return Q("halal", "choice", "Adakah sumber pendapatan anda halal?", "Syarat Wajib", {
        help: "Pendapatan dari riba, judi dan seumpamanya tidak dizakatkan.",
        options: [
          { v: true, l: "Ya, halal" },
          { v: false, l: "Tidak / sumber haram" },
        ],
      });
    if (!("method" in f))
      return Q("method", "choice", "Kaedah pengiraan yang anda pilih?", "Kaedah", {
        help: '"Tolak Had Kifayah" lebih tepat untuk yang ada tanggungan.',
        options: [
          { v: "kasar", l: "Pendapatan kasar", sub: "Terus didarab 2.5%" },
          { v: "bersih", l: "Tolak Had Kifayah", sub: "Tolak keperluan asasi dahulu" },
        ],
      });
    if (!("incGaji" in f))
      return Q("income", "group", "Berapakah pendapatan anda setahun?", "Pendapatan", {
        help: "Masukkan jumlah setahun (RM). Biarkan kosong jika tiada.",
        fields: [
          { k: "incGaji", l: "Penggajian & upah (gaji, bonus, elaun, OT)", unit: "RM" },
          { k: "incBebas", l: "Kerja bebas & profesional (komisen, royalti)", unit: "RM" },
          { k: "incSewa", l: "al-Mustaghallat (sewa rumah / aset)", unit: "RM" },
          { k: "incBeri", l: "Pemberian / sumbangan (hibah, pampasan)", unit: "RM" },
        ],
      });
    if (f.method === "bersih") {
      if (!("hkDewasaKerja" in f))
        return Q("household", "group", "Tanggungan dalam isi rumah anda?", "Had Kifayah", {
          help: "Bilangan orang per kategori. Ketua keluarga (RM14,580) dikira automatik.",
          fields: [
            { k: "hkDewasaKerja", l: "Dewasa bekerja 18+ (RM4,944)", unit: "org" },
            { k: "hkDewasaTak", l: "Dewasa tidak bekerja 18+ (RM2,004)", unit: "org" },
            { k: "hkIpt", l: "Tanggungan belajar IPT (RM7,356)", unit: "org" },
            { k: "hkAnak7_17", l: "Anak 7–17 tahun (RM4,896)", unit: "org" },
            { k: "hkAnak6", l: "Anak 6 tahun ke bawah (RM2,100)", unit: "org" },
            { k: "hkOku", l: "Anak OKU (RM2,964)", unit: "org" },
            { k: "hkKronik", l: "Pesakit kronik (RM2,916)", unit: "org" },
            { k: "hkJagaan", l: "Kos penjagaan anak (RM3,960)", unit: "org" },
          ],
        });
      if (!("kwsp" in f))
        return Q("potongan", "group", "Potongan lain yang dibenarkan?", "Had Kifayah", {
          help: "KWSP (11% pekerja) dan Tabung Haji boleh ditolak.",
          fields: [
            { k: "kwsp", l: "Caruman KWSP pekerja setahun", unit: "RM" },
            { k: "th", l: "Simpanan Tabung Haji setahun", unit: "RM" },
          ],
        });
    }
    return null;
  },

  _savings(f: Facts): Question | null {
    if (!("haul" in f))
      return Q("haul", "choice", "Adakah simpanan ini telah cukup haul?", "Syarat Wajib", {
        help: "Cukup haul = baki kekal melebihi setahun Hijrah.",
        options: [
          { v: true, l: "Ya, lebih setahun" },
          { v: false, l: "Tidak" },
        ],
      });
    if (f._sDone) return null;
    if (!("_accType" in f))
      return Q("accType", "choice", "Jenis akaun simpanan ini?", "Akaun Simpanan", {
        help: "Faedah (riba) ditolak dari akaun konvensional sebelum pengiraan.",
        options: [
          { v: "konvensional", l: "Konvensional", sub: "Ada faedah / interest" },
          { v: "wadiah", l: "Islamik (Wadiah)", sub: "Ada hibah" },
        ],
      });
    if (!("_accBaki" in f))
      return Q("accBaki", "number", "Baki TERENDAH akaun ini sepanjang tahun?", "Akaun Simpanan", {
        help: "Gunakan jumlah paling rendah dalam tempoh haul.",
        field: { k: "_accBaki", unit: "RM" },
      });
    if (f._accType === "konvensional" && !("_accFaedah" in f))
      return Q("accFaedah", "number", "Jumlah faedah diterima setahun?", "Akaun Simpanan", {
        help: "Faedah (riba) akan ditolak daripada baki.",
        field: { k: "_accFaedah", unit: "RM" },
      });
    return Q("accMore", "choice", "Ada akaun simpanan lain?", "Akaun Simpanan", {
      help: "Baki terendah SEMUA akaun digabung untuk semakan nisab.",
      options: [
        { v: "ya", l: "Ya, tambah akaun lain" },
        { v: "tidak", l: "Tidak, kira sekarang" },
      ],
    });
  },

  _gold(f: Facts): Question | null {
    if (!("haul" in f))
      return Q("haul", "choice", "Adakah emas ini dimiliki cukup haul?", "Syarat Wajib", {
        help: "Emas hendaklah dimiliki genap setahun Hijrah.",
        options: [
          { v: true, l: "Ya, lebih setahun" },
          { v: false, l: "Tidak" },
        ],
      });
    if (f._gDone) return null;
    if (!("_gKat" in f))
      return Q("gKat", "choice", "Bagaimana emas ini dimiliki?", "Item Emas", {
        help: "Kategori berbeza → kaedah pengiraan berbeza.",
        options: [
          { v: "simpanan", l: "Emas simpanan / tidak dipakai", sub: "Jongkong, syiling — nisab 85g" },
          { v: "perhiasan", l: "Emas perhiasan dipakai", sub: "Dipakai — uruf 800g" },
          { v: "cagar", l: "Emas dicagar (pajak gadai)", sub: "Tolak pinjaman & upah" },
        ],
      });
    if (!("_gBerat" in f))
      return Q("gBerat", "number", "Berapakah berat emas ini?", "Item Emas", {
        help: "Dalam gram. Tolak berat batu permata jika ada.",
        field: { k: "_gBerat", unit: "gram" },
      });
    if (!("_gKarat" in f))
      return Q("gKarat", "choice", "Apakah ketulenan emas ini?", "Item Emas", {
        help: "Setiap karat dinilai mengikut harga semasa.",
        options: [
          { v: "999", l: "24K (999)", sub: "RM628.51 / gram" },
          { v: "916", l: "22K (916)", sub: "RM575.72 / gram" },
        ],
      });
    if (f._gKat === "cagar" && !("_gPinjaman" in f))
      return Q("gCagar", "group", "Butiran cagaran emas ini", "Item Emas", {
        help: "Nilai-nilai ini akan ditolak sebelum pengiraan zakat.",
        fields: [
          { k: "_gPinjaman", l: "Baki pinjaman (hutang gadai)", unit: "RM" },
          { k: "_gUpah", l: "Upah simpan", unit: "RM" },
        ],
      });
    return Q("gMore", "choice", "Ada emas lain (jenis / ketulenan berbeza)?", "Item Emas", {
      help: "Setiap emas dinilai mengikut karatnya, kemudian dijumlahkan.",
      options: [
        { v: "ya", l: "Ya, tambah emas lain" },
        { v: "tidak", l: "Tidak, kira sekarang" },
      ],
    });
  },

  _asb(f: Facts): Question | null {
    // Zakat ASB uses al-Mustaghallat method (dividend only)
    // ASNB class decides whether nisab/haul are assessed individually or collectively
    if (!("kelasAsb" in f))
      return Q("kelasAsb", "choice", "Kelas akaun ASNB anda?", "Syarat Wajib", {
        help: "Kelas A ialah tetapan asal. Kelas B (Zakat Khultah) ialah pilihan opt-in dalam myASNB.",
        options: [
          { v: "A", l: "Kelas A — saya kira & bayar sendiri", sub: "Nisab & haul individu dinilai" },
          { v: "B", l: "Kelas B — Zakat Khultah (auto)", sub: "Nisab kolektif; zakat auto-potong" },
        ],
      });

    // Kelas A: check haul
    if (f.kelasAsb === "A" && !("haul" in f))
      return Q("haul", "choice", "Pelaburan ASB cukup haul?", "Syarat Wajib", {
        options: [
          { v: true, l: "Ya" },
          { v: false, l: "Tidak" },
        ],
      });

    // Kelas A: modal + dividen needed for nisab check
    if (f.kelasAsb === "A" && !("asbNilai" in f))
      return Q("asbMust", "group", "Maklumat pelaburan ASB", "Maklumat", {
        help: "Modal disemak untuk nisab sahaja. Zakat 2.57% dikira atas dividen sahaja.",
        fields: [
          { k: "asbNilai", l: "Baki pelaburan ASB (modal)", unit: "RM" },
          { k: "asbDiv", l: "Dividen & bonus setahun", unit: "RM" },
        ],
      });

    // Kelas B: only dividend needed (nisab is collective/khultah)
    if (f.kelasAsb === "B" && !("asbDiv" in f))
      return Q("asbDiv", "number", "Jumlah dividen & bonus diterima setahun?", "Maklumat", {
        help: "Modal pelaburan tidak dizakatkan dan tidak diperlukan untuk semakan nisab (khultah).",
        field: { k: "asbDiv", unit: "RM" },
      });

    return null;
  },

  apply(f: Facts, qid: string, value: unknown): Facts {
    f = { ...f };

    // Handle savings accounts
    if (qid === "accMore") {
      f.accounts = (f.accounts as unknown[]) ?? [];
      (f.accounts as unknown[]).push({
        type: f._accType,
        baki: num(f._accBaki),
        faedah: num(f._accFaedah),
      });
      delete f._accType;
      delete f._accBaki;
      delete f._accFaedah;
      if (value === "tidak") f._sDone = true;
      return f;
    }

    // Handle gold items
    if (qid === "gMore") {
      f.goldItems = (f.goldItems as unknown[]) ?? [];
      (f.goldItems as unknown[]).push({
        kat: f._gKat,
        berat: num(f._gBerat),
        karat: f._gKarat,
        pinjaman: num(f._gPinjaman),
        upah: num(f._gUpah),
      });
      delete f._gKat;
      delete f._gBerat;
      delete f._gKarat;
      delete f._gPinjaman;
      delete f._gUpah;
      if (value === "tidak") f._gDone = true;
      return f;
    }

    // Handle ASB Kelas A/B values
    if (qid === "kelasAsb") {
      f.kelasAsb = value as string;
      return f;
    }
    if (qid === "asbNilai") {
      f.asbNilai = num(value);
      return f;
    }
    if (qid === "asbDiv") {
      f.asbDiv = num(value);
      return f;
    }

    // Handle group questions (object values)
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const k in value as Record<string, unknown>) {
        f[k] = num((value as Record<string, unknown>)[k]);
      }
      return f;
    }

    // Handle individual questions
    const keymap: Record<string, string> = {
      muslim: "muslim",
      halal: "halal",
      method: "method",
      haul: "haul",
      accType: "_accType",
      accBaki: "_accBaki",
      accFaedah: "_accFaedah",
      gKat: "_gKat",
      gBerat: "_gBerat",
      gKarat: "_gKarat",
      kaedahAsb: "kaedahAsb",
      asbBase: "asbBase",
    };

    const numericIds = new Set(["accBaki", "accFaedah", "gBerat", "asbBase", "asbDiv", "asbNilai"]);
    const key = keymap[qid] ?? qid;
    f[key] = numericIds.has(qid) ? num(value) : value;

    return f;
  },
};