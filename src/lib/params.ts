export const PARAMS = {
  NISAB_RM:     42047.00,
  RATE:         0.025,
  RATE_ASB:     0.0257,
  NISAB_GOLD_G: 85.0,
  URUF_G:       800.0,
  GOLD_PRICE:   { "999": 628.51, "916": 575.72 } as Record<string, number>,
  HAD_KIFAYAH: {
    ketua: 14580, dewasaKerja: 4944, dewasaTak: 2004,
    ipt: 7356, anak7_17: 4896, anak6: 2100,
    oku: 2964, kronik: 2916, jagaan: 3960,
  },
} as const;