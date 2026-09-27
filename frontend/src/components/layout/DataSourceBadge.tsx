import { useSyncExternalStore } from 'react';
import { IS_MOCK_MODE, mockedMethods, subscribeMocked } from '../../api';

// Честно показываем, откуда данные: весь интерфейс на моках или часть методов подменена моками
export function DataSourceBadge() {
  const mocked = useSyncExternalStore(subscribeMocked, mockedMethods);
  if (IS_MOCK_MODE) {
    return (
      <span className="badge badge--warning" title="VITE_API_URL не задан">
        Мок-данные
      </span>
    );
  }
  if (mocked.length === 0) return null;
  return (
    <span
      className="badge badge--warning"
      title={`Бэкенд пока не отдаёт эти методы — данные из моков: ${mocked.join(', ')}`}
    >
      Частично мок: {mocked.join(', ')}
    </span>
  );
}
