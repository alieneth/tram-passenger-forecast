import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type StatTone = 'default' | 'danger' | 'warning' | 'ok';

export function StatCard({
  label,
  value,
  note,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: IconName;
  tone?: StatTone;
}) {
  return (
    <div className="stat-card">
      {icon && (
        <span className={`stat-card__icon stat-card__icon--${tone}`} aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
      )}
      <div className="stat-card__body">
        <span className="stat-card__label">{label}</span>
        <span className={`stat-card__value stat-card__value--${tone}`}>{value}</span>
        {note && <span className="stat-card__note">{note}</span>}
      </div>
    </div>
  );
}
