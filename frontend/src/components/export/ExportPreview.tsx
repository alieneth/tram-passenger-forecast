import type { ForecastResponse } from '../../api';
import { PREVIEW_ROWS } from './exportParams';

// Превью в том виде, как строки лягут в CSV: те же колонки, числа без разделителей разрядов
export function ExportPreview({
  forecast,
  totalRows,
}: {
  forecast: ForecastResponse;
  totalRows: number;
}) {
  const rows = forecast.items.slice(0, PREVIEW_ROWS);
  return (
    <>
      <table className="data-table data-table--mono">
        <thead>
          <tr>
            <th>route</th>
            <th>date</th>
            <th>hour</th>
            <th>prediction</th>
            <th>lower</th>
            <th>upper</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={`${item.route}-${item.date}-${item.hour ?? 'day'}`}>
              <td>{item.route}</td>
              <td>{item.date}</td>
              <td>{item.hour ?? ''}</td>
              <td>{item.prediction}</td>
              <td>{item.lower}</td>
              <td>{item.upper}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Первые {rows.length} строк из {new Intl.NumberFormat('ru-RU').format(totalRows)}. Модель{' '}
        {forecast.model_version}, прогноз рассчитан {forecast.generated_at.replace('T', ' ')}
      </p>
    </>
  );
}
