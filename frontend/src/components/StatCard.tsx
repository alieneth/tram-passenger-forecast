import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'default' | 'danger' | 'warning';
}) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <span className={`stat-card__value stat-card__value--${tone}`}>{value}</span>
      {note && <span className="stat-card__note">{note}</span>}
    </div>
  );
}
