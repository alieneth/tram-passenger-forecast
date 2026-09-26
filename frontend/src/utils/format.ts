const numberFormat = new Intl.NumberFormat('ru-RU');
const decimalFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

// 186 400 → «186 тыс.», 17 400 → «17,4 тыс.»
export function formatThousands(value: number): string {
  if (value < 1000) return formatNumber(value);
  const thousands = value / 1000;
  return `${decimalFormat.format(thousands >= 100 ? Math.round(thousands) : thousands)} тыс.`;
}

export function formatHour(hour: number): string {
  return String(hour).padStart(2, '0');
}

export function formatHourTime(hour: number): string {
  return `${formatHour(hour)}:00`;
}

export function formatTemperature(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}°C`;
}
