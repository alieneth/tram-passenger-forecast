import type { FactorsResponse } from '../../api';
import { formatDecimal } from '../../utils/format';

type Contribution = NonNullable<FactorsResponse['contributions']>[number];

// «Почему такой прогноз?» — вклад факторов в процентах; длина полосы — относительно самого сильного
export function FactorContributions({ contributions }: { contributions: Contribution[] }) {
  const max = Math.max(1, ...contributions.map((item) => Math.abs(item.effect_pct)));
  const sorted = [...contributions].sort((a, b) => Math.abs(b.effect_pct) - Math.abs(a.effect_pct));

  return (
    <ul className="contributions">
      {sorted.map((item) => {
        const positive = item.effect_pct >= 0;
        return (
          <li key={item.factor_code} className="contributions__row">
            <span>{item.factor_name}</span>
            <span className="contributions__track" aria-hidden="true">
              <span
                className={`contributions__bar contributions__bar--${positive ? 'up' : 'down'}`}
                style={{ width: `${(Math.abs(item.effect_pct) / max) * 100}%` }}
              />
            </span>
            <span className="contributions__value">
              {positive ? '+' : '−'}
              {formatDecimal(Math.abs(item.effect_pct))}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}
