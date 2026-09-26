import { describeRequest, type ForecastQuery, type ForecastResponse } from '../../api';
import { CopyButton } from './CopyButton';

// Префикс API по контракту — пример показываем относительно сервера API
const API_PREFIX = '/api/v1';
const EXAMPLE_ITEMS = 2;

// Пример запроса и ответа — настоящий запрос превью, а не выдуманный текст
export function ApiExample({
  query,
  forecast,
}: {
  query: ForecastQuery;
  forecast: ForecastResponse;
}) {
  const request = `GET ${API_PREFIX}${describeRequest('/forecast', query)}`;
  const shown = { ...forecast, items: forecast.items.slice(0, EXAMPLE_ITEMS) };
  const response = JSON.stringify(shown, null, 2);

  return (
    <div className="api-example">
      <div className="api-example__header">
        <span className="header__label">Пример запроса</span>
        <CopyButton text={request} />
      </div>
      <pre className="code code--wrap">{request}</pre>
      <div className="api-example__header">
        <span className="header__label">
          Пример ответа (показаны {shown.items.length} из {forecast.items.length} записей)
        </span>
        <CopyButton text={response} />
      </div>
      <pre className="code code--scroll">{response}</pre>
    </div>
  );
}
