import type { FactorsResponse } from '../api';

// Праздники и перенесённые выходные выглядят как выходные, с подписью (06_opisanie-maketov, экран 3)
export function isDayOff(factors: FactorsResponse | undefined): boolean {
  return factors?.day_type === 'weekend' || factors?.day_type === 'holiday';
}

export function dayMark(factors: FactorsResponse | undefined): string | null {
  if (!factors) return null;
  if (factors.day_type === 'holiday') return 'праздник';
  if (factors.day_type === 'shortened') return 'сокр.';
  if (factors.special_day_name) return 'перенос';
  return null;
}

export function dayMarkTitle(factors: FactorsResponse | undefined): string | undefined {
  return factors?.holiday_name ?? factors?.special_day_name ?? undefined;
}
