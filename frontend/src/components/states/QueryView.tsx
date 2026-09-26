import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage, isEmptyDataError } from '../../api';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

interface QueryViewProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  // Подсказка под сообщением «нет данных» (сам текст — из API)
  emptyHint?: string;
}

// Единая обработка загрузки, пустых состояний и ошибок — вместо пустого экрана всегда сообщение
export function QueryView<T>({ query, children, emptyHint }: QueryViewProps<T>) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    if (isEmptyDataError(query.error)) {
      return <EmptyState message={query.error.message} hint={emptyHint} />;
    }
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}
