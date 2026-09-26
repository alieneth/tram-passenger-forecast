// Адрес API — только из VITE_API_URL. Пусто или не задано — работаем на мок-данных из src/mocks/.
const rawApiUrl = (import.meta.env.VITE_API_URL ?? '').trim();

export const API_URL = rawApiUrl.replace(/\/+$/, '');
export const IS_MOCK_MODE = API_URL === '';
