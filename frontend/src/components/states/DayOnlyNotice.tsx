import { useFilters } from '../../hooks/useFilters';
import { Panel } from '../Panel';
import { EmptyState } from './EmptyState';

// Экран строится по часам одного дня — на горизонте «Месяц» предлагаем переключиться
export function DayOnlyNotice({ title, message }: { title: string; message: string }) {
  const { setHorizon } = useFilters();
  return (
    <div className="page">
      <Panel title={title}>
        <EmptyState message={message} hint="Для горизонта «Месяц» откройте экран «Маршрут»" />
        <button type="button" className="button" onClick={() => setHorizon('day')}>
          Переключить на «День»
        </button>
      </Panel>
    </div>
  );
}
