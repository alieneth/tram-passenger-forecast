const WIDTH = 96;
const HEIGHT = 24;
const PADDING = 2;

// Мини-график суточного профиля: форма пиков важнее точных чисел (они — в подписи рядом)
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = (WIDTH - PADDING * 2) / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = PADDING + index * step;
      const y = HEIGHT - PADDING - (value / max) * (HEIGHT - PADDING * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      className="sparkline"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
    >
      <polyline points={points} fill="none" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
