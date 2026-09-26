import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Map as MapLibreMap } from 'maplibre-gl';

export const LINES_SOURCE = 'routes';
export const STOPS_SOURCE = 'route-stops';
export const HIT_LAYER = 'route-hit';

const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const DIMMED_OPACITY = 0.25;

// Приглушаем невыбранные маршруты, остальные — в полную силу
const opacity = (full: number): ExpressionSpecification => [
  'case',
  ['get', 'dimmed'],
  full * DIMMED_OPACITY,
  full,
];

// Подписи подложки — на русском: в тайлах OpenStreetMap поле name хранит местное название
export function applyLocalNames(map: MapLibreMap): void {
  for (const layer of map.getStyle().layers) {
    if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field') !== undefined) {
      map.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', 'name'],
        ['get', 'name_en'],
      ]);
    }
  }
}

// Слои: свечение → подсветка события → линия (у маршрута без данных — пунктир) → остановки → зона наведения
export function addRouteLayers(map: MapLibreMap): void {
  map.addSource(LINES_SOURCE, { type: 'geojson', data: EMPTY });
  map.addSource(STOPS_SOURCE, { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'route-glow',
    type: 'line',
    source: LINES_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 12,
      'line-blur': 8,
      'line-opacity': opacity(0.45),
    },
  });
  map.addLayer({
    id: 'route-event',
    type: 'line',
    source: LINES_SOURCE,
    filter: ['==', ['get', 'has_event'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': opacity(0.35) },
  });
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: LINES_SOURCE,
    filter: ['==', ['get', 'no_data'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': opacity(1) },
  });
  map.addLayer({
    id: 'route-line-no-data',
    type: 'line',
    source: LINES_SOURCE,
    filter: ['==', ['get', 'no_data'], true],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 4,
      'line-dasharray': [1.5, 1.2],
      'line-opacity': opacity(1),
    },
  });
  map.addLayer({
    id: 'route-stops',
    type: 'circle',
    source: STOPS_SOURCE,
    paint: {
      'circle-radius': 4,
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#0a1626',
      'circle-stroke-width': 1.5,
      'circle-opacity': opacity(1),
      'circle-stroke-opacity': opacity(1),
    },
  });
  map.addLayer({
    id: HIT_LAYER,
    type: 'line',
    source: LINES_SOURCE,
    paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
  });
}
