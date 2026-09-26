import { useHealth } from '../../hooks/useHealth';
import { formatDate } from '../../utils/dates';

// Откуда данные и какой моделью посчитан прогноз — как в подвале макетов
const DATA_SOURCE = 'валидации янв–окт 2025';

export function Footer() {
  const health = useHealth();
  const model = health.data?.active_model_version;
  const generatedAt = health.data?.forecast_generated_at;
  return (
    <footer className="footer">
      <span>Данные: {DATA_SOURCE}</span>
      <span>Модель: {model ?? '—'}</span>
      {generatedAt && (
        <span>
          Прогноз рассчитан {formatDate(generatedAt.slice(0, 10))} {generatedAt.slice(11, 16)}
        </span>
      )}
    </footer>
  );
}
