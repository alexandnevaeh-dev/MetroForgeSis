import type { ReactNode } from 'react';

export function ScreenHeader({
  eyebrow,
  title,
  description,
  actions,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Dense editor headers (~40–44px action row). */
  compact?: boolean;
}) {
  return (
    <header className={['screen-header', compact ? 'screen-header-compact' : ''].filter(Boolean).join(' ')}>
      <div>
        {eyebrow && <p className="screen-eyebrow type-label">{eyebrow}</p>}
        <h2 className="type-page-title">{title}</h2>
        {description && !compact && <p className="hint type-body-secondary">{description}</p>}
        {description && compact && (
          <p className="hint type-caption screen-header-compact-desc">{description}</p>
        )}
      </div>
      {actions && <div className="screen-header-actions">{actions}</div>}
    </header>
  );
}
