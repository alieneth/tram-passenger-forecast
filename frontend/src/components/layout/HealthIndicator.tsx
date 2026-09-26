import { errorMessage } from '../../api';
import { useHealth } from '../../hooks/useHealth';

type Tone = 'ok' | 'warning' | 'danger' | 'unknown';

// Зелёный — только когда проблем нет (общее правило 8): сервис и БД работают, прогноз рассчитан
function describe(health: ReturnType<typeof useHealth>): { tone: Tone; text: string } {
  if (health.isPending) return { tone: 'unknown', text: 'Проверяем сервис…' };
  if (health.isError) return { tone: 'danger', text: errorMessage(health.error) };
  const { status, db, active_model_version } = health.data;
  if (status === 'DOWN' || db === 'DOWN') return { tone: 'danger', text: 'Сервис недоступен' };
  if (!active_model_version) return { tone: 'warning', text: 'Прогноз ещё не рассчитан' };
  if (status === 'DEGRADED') return { tone: 'warning', text: 'Сервис работает с ограничениями' };
  return { tone: 'ok', text: 'Прогноз на ноябрь–декабрь 2025' };
}

export function HealthIndicator() {
  const health = useHealth();
  const { tone, text } = describe(health);
  return (
    <span className={`health health--${tone}`} role="status" title={text}>
      <span className="status-dot" aria-hidden="true" />
      <span className={tone === 'ok' ? 'header__status-text' : 'health__problem'}>{text}</span>
    </span>
  );
}
