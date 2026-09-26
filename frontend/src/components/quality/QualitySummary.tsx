import type { Horizon, ModelQuality } from '../../api';
import { useModelQuality } from '../../hooks/useModelQuality';
import { formatThousands } from '../../utils/format';
import { Icon } from '../Icon';
import { QueryView } from '../states/QueryView';
import { MAE_UNITS } from './units';

const TITLES: Record<Horizon, string> = {
  day: 'День (по часам)',
  month: 'Месяц (по дням)',
};

function QualityBlock({ quality }: { quality: ModelQuality }) {
  const { overall, horizon } = quality;
  const better = (overall.improvement_pct ?? 0) > 0;
  return (
    <div className="quality-block">
      <span className="quality-block__title">
        <Icon name={horizon === 'day' ? 'clock' : 'calendar'} size={20} />
        {TITLES[horizon]}
      </span>
      <dl className="quality-block__values">
        <div>
          <dt>MAE нашей модели</dt>
          <dd>
            <strong>{formatThousands(Math.round(overall.model_mae))}</strong> {MAE_UNITS[horizon]}
          </dd>
        </div>
        <div>
          <dt>Базовая модель</dt>
          <dd>
            {formatThousands(Math.round(overall.baseline_mae))} {MAE_UNITS[horizon]}
          </dd>
        </div>
      </dl>
      {overall.improvement_pct != null && (
        <span className={better ? 'quality-block__delta--good' : 'quality-block__delta--bad'}>
          {better
            ? `↓ ошибка ниже на ${overall.improvement_pct}%`
            : `↑ ошибка выше на ${-overall.improvement_pct}%`}
        </span>
      )}
    </div>
  );
}

// Итог проверки для обоих горизонтов сразу — день и месяц сравнивают на одном экране
export function QualitySummary() {
  const day = useModelQuality('day');
  const month = useModelQuality('month');
  return (
    <div className="quality-summary">
      <QueryView query={day}>{(quality) => <QualityBlock quality={quality} />}</QueryView>
      <QueryView query={month}>{(quality) => <QualityBlock quality={quality} />}</QueryView>
    </div>
  );
}
