import type { StyleSpecification } from 'maplibre-gl';

// Подложка — из VITE_MAP_STYLE_URL (например, тёмный стиль CARTO).
// Если не задана или нет интернета — однотонный тёмный фон: маршруты всё равно видны.
const styleUrl = (import.meta.env.VITE_MAP_STYLE_URL ?? '').trim();

export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0a1626' } }],
};

export const MAP_STYLE: string | StyleSpecification = styleUrl || FALLBACK_STYLE;
