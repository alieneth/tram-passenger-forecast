import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { API_URL, IS_MOCK_MODE, errorMessage, exportForecast, type ExportQuery } from '../api';
import { Panel } from '../components/Panel';
import { ErrorState } from '../components/states/ErrorState';
import { useFilters } from '../hooks/useFilters';
import { formatDate, monthRange } from '../utils/dates';

type ExportFormat = ExportQuery['format'];

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV (разделитель «;»)' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'submission', label: 'Формат сабмита: route;date;hour;prediction' },
];

// Swagger отдаёт бэкенд (springdoc) по адресу /swagger-ui на том же хосте, что и API
function swaggerUrl(): string {
  return `${new URL(API_URL, window.location.origin).origin}/swagger-ui`;
}

function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Каркас экрана «Экспорт и API» (UI-6)
export function ExportPage() {
  const { horizon, date } = useFilters();
  const [format, setFormat] = useState<ExportFormat>('csv');
  // Сабмит — только горизонт «День» (контракт)
  const exportHorizon = format === 'submission' ? 'day' : horizon;
  const period = exportHorizon === 'day' ? { date_from: date, date_to: date } : monthRange(date);

  const download = useMutation({
    mutationFn: () => exportForecast({ format, horizon: exportHorizon, ...period }),
    onSuccess: ({ blob, filename }) => saveFile(blob, filename),
  });

  return (
    <div className="page">
      <Panel title="Выгрузка прогноза">
        <fieldset className="radio-group">
          <legend className="header__label">Формат</legend>
          {FORMATS.map((item) => (
            <label key={item.value} className="radio-group__item">
              <input
                type="radio"
                name="format"
                value={item.value}
                checked={format === item.value}
                onChange={() => setFormat(item.value)}
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <p className="muted">
          Период: {formatDate(period.date_from)} – {formatDate(period.date_to)}, все маршруты,
          горизонт «{exportHorizon === 'day' ? 'День' : 'Месяц'}»
        </p>
        <button
          type="button"
          className="button button--primary"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          {download.isPending ? 'Готовим файл…' : 'Скачать'}
        </button>
        {download.isError && <ErrorState message={errorMessage(download.error)} />}
      </Panel>

      <Panel title="API">
        {IS_MOCK_MODE ? (
          <p className="muted">Swagger доступен при работе с реальным API (задайте VITE_API_URL)</p>
        ) : (
          <a className="button" href={swaggerUrl()} target="_blank" rel="noreferrer">
            Открыть Swagger
          </a>
        )}
      </Panel>
    </div>
  );
}
