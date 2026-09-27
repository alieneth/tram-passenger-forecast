import { useHealth } from '../../hooks/useHealth';
import { formatDate } from '../../utils/dates';
import { QueryView } from '../states/QueryView';

// Требования организаторов. Фактические цифры — только из нагрузочного теста (OPS-3, README);
// до него показываем цель и прочерк, а не придуманные значения
const PERFORMANCE_TARGETS = [
  { label: 'Задержка p95', target: '< 200–300 мс' },
  { label: 'Нагрузка', target: 'сотни RPS' },
  { label: 'Ресурсы контейнера', target: '2–4 vCPU / 2–4 ГБ' },
];

const STATUS_LABELS = { UP: 'работает', DEGRADED: 'с ограничениями', DOWN: 'недоступен' } as const;

export function ServiceStatus() {
  const healthQuery = useHealth();

  return (
    <div className="service-status">
      <QueryView query={healthQuery}>
        {(health) => (
          <dl className="chart-summary">
            <div>
              <dt>Сервис</dt>
              <dd className={health.status === 'UP' ? undefined : 'text-up'}>
                {STATUS_LABELS[health.status]}
              </dd>
            </div>
            <div>
              <dt>База данных</dt>
              <dd className={health.db === 'UP' ? undefined : 'text-up'}>
                {STATUS_LABELS[health.db]}
              </dd>
            </div>
            <div>
              <dt>Версия модели</dt>
              <dd>{health.active_model_version ?? 'нет активной'}</dd>
            </div>
            <div>
              <dt>Прогноз рассчитан</dt>
              <dd>
                {health.forecast_generated_at
                  ? `${formatDate(health.forecast_generated_at.slice(0, 10))} ${health.forecast_generated_at.slice(11, 16)}`
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
      </QueryView>

      <h3 className="service-status__title">Производительность</h3>
      <ul className="perf-tiles">
        {PERFORMANCE_TARGETS.map((item) => (
          <li key={item.label} className="perf-tile">
            <span className="stat-card__label">{item.label}</span>
            <span className="perf-tile__value">—</span>
            <span className="stat-card__note">цель: {item.target}</span>
          </li>
        ))}
      </ul>
      <p className="muted">
        Результаты появятся после нагрузочного теста (OPS-3) и будут в README.
      </p>
    </div>
  );
}
