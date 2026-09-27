import type { UseQueryResult } from '@tanstack/react-query';
import { errorMessage, type ForecastResponse } from '../../api';

// Что написать поверх карты, если на ней нечего или нечем красить. null — всё в порядке
export function mapNotice(
  forecast: UseQueryResult<ForecastResponse>,
  geometries: { count: number; isPending: boolean },
): string | null {
  if (!geometries.isPending && geometries.count === 0) {
    return 'Нет координат ни для одного маршрута — маршруты показаны списком ниже';
  }
  if (forecast.isPending) return 'Загружаем прогноз…';
  if (forecast.isError) return errorMessage(forecast.error);
  if (forecast.data && forecast.data.items.length === 0) return 'Нет данных за выбранную дату';
  return null;
}
