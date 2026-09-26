import { Icon } from '../Icon';

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="state">
      <Icon name="calendar" size={28} />
      <p className="state__message">{message}</p>
      {hint && <p className="state__hint">{hint}</p>}
    </div>
  );
}
