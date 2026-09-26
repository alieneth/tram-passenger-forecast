import { skipToken, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  API_URL,
  IS_MOCK_MODE,
  errorMessage,
  exportForecast,
  getForecast,
  type ExportQuery,
  type Route,
} from '../api';
import { ApiExample } from '../components/export/ApiExample';
import { ExportPreview } from '../components/export/ExportPreview';
import {
  expectedRows,
  toExportQuery,
  toPreviewQuery,
  type ExportParams,
  type FileFormat,
} from '../components/export/exportParams';
import { RoutePicker } from '../components/export/RoutePicker';
import { ServiceStatus } from '../components/export/ServiceStatus';
import { Panel } from '../components/Panel';
import { EmptyState } from '../components/states/EmptyState';
import { ErrorState } from '../components/states/ErrorState';
import { QueryView } from '../components/states/QueryView';
import { FORECAST_DATE_MAX, FORECAST_DATE_MIN } from '../config/constants';
import { useFilters } from '../hooks/useFilters';
import { useRoutes } from '../hooks/useRoutes';
import { saveFile } from '../utils/download';
import { formatNumber } from '../utils/format';

const FILE_FORMATS: { value: FileFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'XLSX' },
];

// Swagger отдаёт бэкенд (springdoc) по адресу /swagger-ui на том же хосте, что и API
function swaggerUrl(): string {
  return `${new URL(API_URL, window.location.origin).origin}/swagger-ui`;
}

// Экран «Экспорт и API» (UI-6)
export function ExportPage() {
  const routesQuery = useRoutes();
  return (
    <QueryView query={routesQuery}>{(routes) => <ExportScreen routes={routes.items} />}</QueryView>
  );
}

function ExportScreen({ routes }: { routes: Route[] }) {
  const { horizon } = useFilters();
  // По умолчанию — весь период прогноза, как в test_submission.csv
  const [params, setParams] = useState<ExportParams>({
    horizon,
    routes: null,
    date_from: FORECAST_DATE_MIN,
    date_to: FORECAST_DATE_MAX,
    format: 'csv',
  });
  const update = (patch: Partial<ExportParams>) =>
    setParams((current) => ({ ...current, ...patch }));

  const periodInvalid = params.date_to < params.date_from;
  const noRoutes = params.routes?.length === 0;
  const firstRoute = params.routes?.[0] ?? routes[0]?.route;
  const previewQuery =
    firstRoute === undefined || periodInvalid || noRoutes
      ? null
      : toPreviewQuery(params, firstRoute);
  const preview = useQuery({
    queryKey: ['forecast', 'export-preview', previewQuery],
    queryFn: previewQuery ? ({ signal }) => getForecast(previewQuery, signal) : skipToken,
  });

  const download = useMutation({
    mutationFn: (query: ExportQuery) => exportForecast(query),
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
  });
  const submissionQuery: ExportQuery = {
    format: 'submission',
    horizon: 'day',
    date_from: FORECAST_DATE_MIN,
    date_to: FORECAST_DATE_MAX,
  };
  const submissionRows = expectedRows(
    { ...params, ...submissionQuery, routes: null, format: 'csv' },
    routes.length,
  );

  return (
    <div className="export-grid">
      <div className="export-grid__main">
        <Panel title="Выгрузка прогноза">
          <div className="form-grid">
            <label className="toolbar__field">
              <span className="header__label">Детализация</span>
              <select
                className="field"
                value={params.horizon}
                onChange={(event) =>
                  update({ horizon: event.target.value === 'month' ? 'month' : 'day' })
                }
              >
                <option value="day">По часам · День</option>
                <option value="month">По дням · Месяц</option>
              </select>
            </label>
            <div className="toolbar__field">
              <span className="header__label">Маршруты</span>
              <RoutePicker
                routes={routes}
                value={params.routes}
                onChange={(value) => update({ routes: value })}
              />
            </div>
            <div className="toolbar__field form-grid__wide">
              <span className="header__label">Период</span>
              <div className="period">
                <input
                  className="field"
                  type="date"
                  aria-label="Начало периода"
                  value={params.date_from}
                  min={FORECAST_DATE_MIN}
                  max={FORECAST_DATE_MAX}
                  onChange={(event) =>
                    event.target.value && update({ date_from: event.target.value })
                  }
                />
                <span aria-hidden="true">—</span>
                <input
                  className="field"
                  type="date"
                  aria-label="Конец периода"
                  value={params.date_to}
                  min={FORECAST_DATE_MIN}
                  max={FORECAST_DATE_MAX}
                  onChange={(event) =>
                    event.target.value && update({ date_to: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="toolbar__field">
              <span className="header__label">Формат файла</span>
              <div className="segmented" role="group" aria-label="Формат файла">
                {FILE_FORMATS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`segmented__item${params.format === item.value ? ' segmented__item--active' : ''}`}
                    aria-pressed={params.format === item.value}
                    onClick={() => update({ format: item.value })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {periodInvalid && <p className="text-up">Конец периода раньше начала</p>}
          {noRoutes && <p className="text-up">Выберите хотя бы один маршрут</p>}
          {IS_MOCK_MODE && params.format === 'xlsx' && (
            <p className="muted">
              В мок-режиме XLSX скачивается как CSV — настоящий файл собирает бэкенд
            </p>
          )}

          <div className="export-actions">
            <button
              type="button"
              className="button button--primary"
              disabled={download.isPending || periodInvalid || noRoutes}
              onClick={() => download.mutate(toExportQuery(params))}
            >
              {download.isPending ? 'Готовим файл…' : 'Скачать'}
            </button>
            <span className="muted">
              {formatNumber(expectedRows(params, routes.length))} строк, разделитель «;»
            </span>
          </div>
          {download.isError && <ErrorState message={errorMessage(download.error)} />}
        </Panel>

        <Panel title="Формат сабмита">
          <p>
            Ровно <code>route;date;hour;prediction</code>, как <code>test_submission.csv</code>: все
            маршруты, все 24 часа, 01.11–31.12.2025 — {formatNumber(submissionRows)} строк.
          </p>
          <div className="export-actions">
            <button
              type="button"
              className="button"
              disabled={download.isPending}
              onClick={() => download.mutate(submissionQuery)}
            >
              Скачать файл сабмита
            </button>
          </div>
        </Panel>

        <Panel title="Предпросмотр данных">
          {previewQuery === null ? (
            <EmptyState message="Нет данных для предпросмотра" hint="Проверьте период и маршруты" />
          ) : (
            <QueryView query={preview}>
              {(forecast) => (
                <ExportPreview
                  forecast={forecast}
                  totalRows={expectedRows(params, routes.length)}
                />
              )}
            </QueryView>
          )}
        </Panel>
      </div>

      <div className="export-grid__side">
        <Panel title="REST API">
          {previewQuery && preview.data && (
            <ApiExample query={previewQuery} forecast={preview.data} />
          )}
          {IS_MOCK_MODE ? (
            <p className="muted">
              Swagger доступен при работе с реальным API (задайте VITE_API_URL)
            </p>
          ) : (
            <a className="button button--wide" href={swaggerUrl()} target="_blank" rel="noreferrer">
              Открыть документацию Swagger
            </a>
          )}
        </Panel>
        <Panel title="Состояние сервиса">
          <ServiceStatus />
        </Panel>
      </div>
    </div>
  );
}
