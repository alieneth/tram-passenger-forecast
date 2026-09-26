import type { ReactNode } from 'react';

export function Panel({
  title,
  actions,
  children,
  className = '',
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel__header">
          {title && <h2 className="panel__title">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
