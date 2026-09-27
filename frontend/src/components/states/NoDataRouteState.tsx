import { EmptyState } from './EmptyState';

// Маршрут исключён организаторами: прогноз по нему — 0, показывать графики из нулей незачем
export function NoDataRouteState({ route }: { route: number }) {
  return (
    <EmptyState
      message={`По маршруту ${route} нет данных`}
      hint="Маршрут исключён организаторами из-за проблем при выгрузке данных — прогноз по нему не строится"
    />
  );
}
