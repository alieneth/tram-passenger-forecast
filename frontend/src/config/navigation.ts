import type { IconName } from '../components/Icon';

export type Wave = 'MVP' | 'В2' | 'В3';

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  wave: Wave;
}

// Порядок и названия — как в меню макетов
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Обзор', icon: 'home', wave: 'MVP' },
  { path: '/map', label: 'Карта', icon: 'map', wave: 'MVP' },
  { path: '/route', label: 'Маршрут', icon: 'route', wave: 'MVP' },
  { path: '/decisions', label: 'Решения', icon: 'decisions', wave: 'В2' },
  { path: '/what-if', label: 'Что если', icon: 'sliders', wave: 'В3' },
  { path: '/quality', label: 'Качество модели', icon: 'quality', wave: 'В2' },
  { path: '/sources', label: 'Источники данных', icon: 'database', wave: 'В3' },
  { path: '/export', label: 'Экспорт и API', icon: 'export', wave: 'MVP' },
];
