import { ApiError } from '../../api';
import { Icon } from '../Icon';

interface ErrorStateProps {
  message: string;
  // Ошибка целиком — чтобы показать details (какие параметры неверны) для VALIDATION_ERROR
  error?: unknown;
  onRetry?: () => void;
}

// Текст — всегда message из ответа API (или наш текст для сетевых ошибок)
export function ErrorState({ message, error, onRetry }: ErrorStateProps) {
  const details = error instanceof ApiError ? (error.details ?? []) : [];
  return (
    <div className="state state--error" role="alert">
      <Icon name="warning" size={28} />
      <p className="state__message">{message}</p>
      {details.length > 0 && (
        <ul className="state__details">
          {details.map((detail) => (
            <li key={`${detail.field}-${detail.message}`}>
              <code>{detail.field}</code>: {detail.message}
            </li>
          ))}
        </ul>
      )}
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}
