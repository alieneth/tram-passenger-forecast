// Цвет означает только интенсивность: зелёный → жёлтый → красный (общее правило 4)
const GREEN: RGB = [34, 197, 94];
const YELLOW: RGB = [250, 204, 21];
const RED: RGB = [239, 68, 68];

type RGB = [number, number, number];

function mix(from: RGB, to: RGB, t: number): RGB {
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t);
  return [channel(from[0], to[0]), channel(from[1], to[1]), channel(from[2], to[2])];
}

// ratio — доля от максимума, 0…1
export function intensityColor(ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio));
  const [r, g, b] = t < 0.5 ? mix(GREEN, YELLOW, t * 2) : mix(YELLOW, RED, (t - 0.5) * 2);
  return `rgb(${r} ${g} ${b})`;
}
