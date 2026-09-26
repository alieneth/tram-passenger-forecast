import { useModelQuality } from '../../hooks/useModelQuality';
import { formatDate } from '../../utils/dates';
import { formatDecimal } from '../../utils/format';
import { QueryView } from '../states/QueryView';

// Насколько можно доверять прогнозу по аналогам: MAE метода, проверенного «с исключением»
// (маршрут с историей прогнозировали так, будто истории нет, и сравнили с фактом)
export function AnalogMethodQuality({ route }: { route: number }) {
  const qualityQuery = useModelQuality('day');
  return (
    <QueryView query={qualityQuery}>
      {(quality) => {
        const row = quality.by_route.find((item) => item.route === route);
        if (!row) {
          return <p className="muted">Ошибка метода для маршрута {route} ещё не посчитана</p>;
        }
        const period = `${formatDate(quality.eval_date_from)}–${formatDate(quality.eval_date_to)}`;
        return (
          <p className="analog-quality">
            Метод аналогов проверен с исключением на {period}: ошибка{' '}
            <strong>{formatDecimal(row.model_mae)}</strong> пасс./ч, у базовой модели —{' '}
            {formatDecimal(row.baseline_mae)}
            {row.improvement_pct != null && ` (точнее на ${row.improvement_pct}%)`}
          </p>
        );
      }}
    </QueryView>
  );
}
