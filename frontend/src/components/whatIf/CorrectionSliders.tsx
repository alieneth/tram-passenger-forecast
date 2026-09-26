import { CORRECTION_LIMITS } from '../../config/constants';
import type { Corrections } from '../../utils/scenario';

type CorrectionKey = keyof Corrections;

const SLIDERS: { key: CorrectionKey; label: string; hint: string }[] = [
  {
    key: 'weather',
    label: 'Погода',
    hint: 'снег и сильный дождь добавляют пассажиров, жара — убавляет',
  },
  { key: 'event', label: 'Событие', hint: 'матч, концерт или перекрытие рядом с маршрутом' },
  { key: 'season', label: 'Сезон', hint: 'каникулы, отпуска, предпраздничные дни' },
];

const signed = (pct: number) => `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;

// Корректирующие коэффициенты (критерий 2в): диспетчер сдвигает ползунок — прогноз пересчитывается сразу
export function CorrectionSliders({
  valuesPct,
  onChange,
}: {
  valuesPct: Record<CorrectionKey, number>;
  onChange: (key: CorrectionKey, pct: number) => void;
}) {
  return (
    <fieldset className="corrections">
      <legend className="header__label">Корректирующие коэффициенты к потоку</legend>
      {SLIDERS.map(({ key, label, hint }) => {
        const { min, max } = CORRECTION_LIMITS[key];
        const value = valuesPct[key];
        const id = `correction-${key}`;
        return (
          <div key={key} className="corrections__row">
            <label htmlFor={id} className="corrections__label">
              {label}
              <output
                className={`corrections__value${value === 0 ? '' : ' corrections__value--set'}`}
              >
                {signed(value)}
              </output>
            </label>
            <input
              id={id}
              type="range"
              min={min}
              max={max}
              step={1}
              value={value}
              aria-valuetext={signed(value)}
              onChange={(event) => onChange(key, Number(event.target.value))}
            />
            <span className="corrections__hint">{hint}</span>
          </div>
        );
      })}
    </fieldset>
  );
}
