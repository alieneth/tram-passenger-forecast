import { lazy, Suspense, type ComponentProps } from 'react';
import { LoadingState } from '../states/LoadingState';

// MapLibre тяжёлый (~1 МБ) — грузим отдельным чанком, когда карта впервые нужна
const RoutesMap = lazy(() =>
  import('./RoutesMap').then((module) => ({ default: module.RoutesMap })),
);

export function LazyRoutesMap(props: ComponentProps<typeof RoutesMap>) {
  return (
    <Suspense fallback={<LoadingState text="Загружаем карту…" />}>
      <RoutesMap {...props} />
    </Suspense>
  );
}
