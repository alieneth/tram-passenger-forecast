import { Icon } from '../Icon';

// Текст — всегда message из ответа API (или наш текст для сетевых ошибок)
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error" role="alert">
      <Icon name="warning" size={28} />
      <p className="state__message">{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}
