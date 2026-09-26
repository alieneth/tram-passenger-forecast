import type { ReactNode } from 'react';
import { errorMessage, isEmptyDataError, type ActualItem, type ForecastItem } from '../../api';
import { useEvalData } from '../../hooks/useEvalData';
import { EmptyState } from '../states/EmptyState';
import { ErrorState } from '../states/ErrorState';
import { LoadingState } from '../states/LoadingState';

// Как QueryView, только для пары «факт + прогноз» за проверочный период
export function EvalDataView({
  children,
}: {
  children: (actuals: ActualItem[], forecast: ForecastItem[]) => ReactNode;
}) {
  const [actualsQuery, forecastQuery] = useEvalData();
  if (actualsQuery.isPending || forecastQuery.isPending) return <LoadingState />;
  const failed = [actualsQuery, forecastQuery].find((query) => query.isError);
  if (failed?.error) {
    return isEmptyDataError(failed.error) ? (
      <EmptyState
        message={failed.error.message}
        hint="Нужен прогноз модели на проверочный период (сентябрь–октябрь) — его пишет пакетный пересчёт"
      />
    ) : (
      <ErrorState
        message={errorMessage(failed.error)}
        error={failed.error}
        onRetry={() => void failed.refetch()}
      />
    );
  }
  return <>{children(actualsQuery.data?.items ?? [], forecastQuery.data?.items ?? [])}</>;
}
