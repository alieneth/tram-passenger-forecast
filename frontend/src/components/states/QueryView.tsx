import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage, isEmptyDataError } from '../../api';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

const DEFAULT_EMPTY_MESSAGE = 'Нет данных за выбранную дату';

interface QueryViewProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  // Подсказка под сообщением «нет данных» (сам текст — из API)
  emptyHint?: string;
  // Успешный ответ без данных (например, items: []) — тоже пустое состояние, а не пустой экран
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
}

// Единая обработка загрузки, пустых состояний и ошибок — вместо пустого экрана всегда сообщение
export function QueryView<T>({
  query,
  children,
  emptyHint,
  isEmpty,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
}: QueryViewProps<T>) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    if (isEmptyDataError(query.error)) {
      return <EmptyState message={query.error.message} hint={emptyHint} />;
    }
    return (
      <ErrorState
        message={errorMessage(query.error)}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (isEmpty?.(query.data)) return <EmptyState message={emptyMessage} hint={emptyHint} />;
  return <>{children(query.data)}</>;
}
