import type { ReactNode } from 'react';

export function ScreenHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="screen-header">
      <div>
        {eyebrow && <p className="screen-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="hint">{description}</p>}
      </div>
      {actions && <div className="screen-header-actions">{actions}</div>}
    </header>
  );
}
