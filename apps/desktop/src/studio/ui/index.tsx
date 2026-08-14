import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TableHTMLAttributes } from 'react';

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  const classes = [
    'mf-btn',
    `mf-btn-${variant}`,
    size === 'sm' ? 'mf-btn-sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={classes} {...props} />;
}

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={['mf-input', className].filter(Boolean).join(' ')} {...props} />;
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={['mf-input', 'mf-select', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </select>
  );
}

export function Panel({
  level = 1,
  className = '',
  title,
  actions,
  children,
  fill,
}: {
  level?: 0 | 1 | 2;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  fill?: boolean;
}) {
  const levelClass = level === 0 ? 'panel' : level === 2 ? 'panel-l2' : 'panel-l1';
  return (
    <div className={[levelClass, fill ? 'mf-panel-fill' : '', className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <div className="mf-panel-head">
          {title ? <h3 className="mf-panel-title">{title}</h3> : <span />}
          {actions ? <div className="mf-panel-actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({
  tone = 'default',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={['mf-badge', `mf-badge-${tone}`, className].filter(Boolean).join(' ')}>{children}</span>;
}

export function Tabs({
  items,
  value,
  onChange,
  className = '',
}: {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={['mf-tabs', className].filter(Boolean).join(' ')} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={value === item.id ? 'tab active' : 'tab'}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actions,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['empty-state', 'mf-empty', 'panel-l1', className].filter(Boolean).join(' ')} role="status">
      <p className="mf-empty-title">{title}</p>
      {description ? <p className="hint">{description}</p> : null}
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function DataTable({
  columns,
  children,
  className = '',
  ...props
}: TableHTMLAttributes<HTMLTableElement> & {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className={['table-wrap', 'mf-table-wrap', className].filter(Boolean).join(' ')}>
      <table className="provider-table mf-data-table" {...props}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function DensityGrid({
  children,
  min = 200,
  className = '',
  style,
}: {
  children: ReactNode;
  min?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={['mf-density-grid', className].filter(Boolean).join(' ')}
      style={{ ['--mf-grid-min' as string]: `${min}px`, ...style }}
    >
      {children}
    </div>
  );
}
