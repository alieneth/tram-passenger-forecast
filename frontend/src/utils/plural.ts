// Русское множественное число: plural(2, ['выход', 'выхода', 'выходов']) → «выхода»
export function plural(count: number, forms: [one: string, few: string, many: string]): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
