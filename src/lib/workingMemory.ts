export type WMValue = boolean | number | string | object | null | undefined;

interface FactEntry { value: WMValue; by: string; }

export function newWM() {
  const _facts: Record<string, FactEntry> = {};
  return {
    has(name: string): boolean {
      return name in _facts;
    },
    value(name: string, dflt?: WMValue): WMValue {
      return this.has(name) ? _facts[name].value : dflt;
    },
    isTrue(name: string): boolean {
      return this.has(name) && _facts[name].value === true;
    },
    assertFact(name: string, value: WMValue, by: string): boolean {
      const cur = _facts[name];
      if (cur && cur.value === value) return false;
      _facts[name] = { value, by };
      return true;
    },
    snapshot(): Record<string, WMValue> {
      const s: Record<string, WMValue> = {};
      for (const k in _facts) s[k] = _facts[k].value;
      return s;
    },
  };
}

export type WM = ReturnType<typeof newWM>;