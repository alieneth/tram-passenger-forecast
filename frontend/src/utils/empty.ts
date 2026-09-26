// Проверка «успешный ответ без данных» для QueryView (items: [] — тоже пустое состояние)
export const hasNoItems = (data: { items: readonly unknown[] }): boolean => data.items.length === 0;
