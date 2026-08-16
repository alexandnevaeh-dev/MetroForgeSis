import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/* ── Status / tone ── */

export type StatusKind = 'PASS' | 'WARN' | 'FAIL' | 'PENDING' | 'RUNNING' | 'INFO' | 'IDLE';
export type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export function statusToTone(status: StatusKind | string): Tone {
  const s = String(status).toUpperCase();
  if (s === 'PASS' || s === 'OK' || s === 'HEALTHY' || s === 'SUCCESS') return 'success';
  if (s === 'WARN' || s === 'WARNING' || s === 'DEGRADED') return 'warning';
  if (s === 'FAIL' || s === 'FAILED' || s === 'ERROR' || s === 'DANGER') return 'danger';
  if (s === 'RUNNING' || s === 'INFO') return 'info';
  if (s === 'PENDING' || s === 'IDLE' || s === 'MUTED') return 'muted';
  return 'default';
}

/* ── Buttons ── */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger' | 'default';

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg' | 'compact';
}) {
  const resolved = variant === 'default' ? 'secondary' : variant;
  const classes = [
    'mf-btn',
    `mf-btn-${resolved}`,
    size === 'sm' ? 'mf-btn-sm' : '',
    size === 'lg' ? 'mf-btn-lg' : '',
    size === 'compact' ? 'mf-btn-compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={classes} {...props} />;
}

export function ButtonStrip({
  children,
  className = '',
  align = 'start',
}: {
  children: ReactNode;
  className?: string;
  align?: 'start' | 'end' | 'between';
}) {
  return (
    <div
      className={['mf-btn-strip', `mf-btn-strip-${align}`, className].filter(Boolean).join(' ')}
      role="group"
    >
      {children}
    </div>
  );
}

/* ── Inputs ── */

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

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={['mf-input', 'mf-textarea', className].filter(Boolean).join(' ')} {...props} />;
}

export function SearchField({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={['mf-search', className].filter(Boolean).join(' ')}>
      <span className="mf-search-icon" aria-hidden="true">
        ⌕
      </span>
      <input className="mf-input mf-search-input" type="search" {...props} />
    </div>
  );
}

/* ── Panel compound ── */

export function PanelHeader({
  title,
  actions,
  className = '',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['mf-panel-head', className].filter(Boolean).join(' ')}>
      {title ? <h3 className="mf-panel-title type-panel-title">{title}</h3> : <span />}
      {actions ? <div className="mf-panel-actions">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({
  children,
  className = '',
  scroll = false,
}: {
  children?: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <div className={['mf-panel-body', scroll ? 'mf-panel-body-scroll' : '', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export function PanelFooter({
  children,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <div className={['mf-panel-footer', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function Panel({
  level = 1,
  className = '',
  title,
  actions,
  children,
  fill,
  footer,
}: {
  level?: 0 | 1 | 2;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  fill?: boolean;
  footer?: ReactNode;
}) {
  const levelClass = level === 0 ? 'panel' : level === 2 ? 'panel-l2' : 'panel-l1';
  return (
    <div className={[levelClass, 'mf-panel', fill ? 'mf-panel-fill' : '', className].filter(Boolean).join(' ')}>
      {(title || actions) && <PanelHeader title={title} actions={actions} />}
      {children}
      {footer ? <PanelFooter>{footer}</PanelFooter> : null}
    </div>
  );
}

export function InspectorPanel({
  title = 'Inspector',
  actions,
  children,
  className = '',
  empty,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  empty?: ReactNode;
}) {
  return (
    <aside className={['panel', 'editor-inspector', 'mf-inspector', className].filter(Boolean).join(' ')}>
      <PanelHeader title={title} actions={actions} />
      <div className="mf-inspector-body">{empty ?? children}</div>
    </aside>
  );
}

export function Toolbar({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['mf-toolbar', 'editor-toolbar', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  );
}

/* ── Property rows ── */

export function PropertySection({
  title,
  children,
  actions,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['mf-prop-section', 'inspector-section', className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <div className="inspector-section-head">
          {title ? <h3 className="inspector-section-title type-label">{title}</h3> : <span />}
          {actions ? <div className="mf-panel-actions">{actions}</div> : null}
        </div>
      )}
      <div className="mf-prop-section-body">{children}</div>
    </div>
  );
}

export function PropertyRow({
  label,
  children,
  hint,
  className = '',
}: {
  label: ReactNode;
  children?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['mf-prop-row', className].filter(Boolean).join(' ')}>
      <div className="mf-prop-label type-label">{label}</div>
      <div className="mf-prop-value">{children}</div>
      {hint ? <div className="mf-prop-hint type-caption">{hint}</div> : null}
    </div>
  );
}

/* ── Status / metrics ── */

export function StatusBadge({
  status,
  children,
  className = '',
}: {
  status: StatusKind | string;
  children?: ReactNode;
  className?: string;
}) {
  const kind = String(status).toUpperCase();
  const tone = statusToTone(kind);
  return (
    <span
      className={['mf-status-badge', `mf-status-${kind.toLowerCase()}`, `mf-badge-${tone}`, 'mf-badge', className]
        .filter(Boolean)
        .join(' ')}
      data-status={kind}
    >
      {children ?? kind}
    </span>
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

export function Metric({
  label,
  value,
  hint,
  tone = 'default',
  className = '',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={['mf-metric', `mf-metric-${tone}`, className].filter(Boolean).join(' ')}>
      <div className="mf-metric-label type-label">{label}</div>
      <div className="mf-metric-value type-numeric">{value}</div>
      {hint ? <div className="mf-metric-hint type-caption">{hint}</div> : null}
    </div>
  );
}

/* ── Feedback states ── */

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
      <p className="mf-empty-title type-section-title">{title}</p>
      {description ? <p className="hint type-body-secondary">{description}</p> : null}
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  actions,
  className = '',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['mf-error-state', 'panel-l1', className].filter(Boolean).join(' ')} role="alert">
      <StatusBadge status="FAIL" />
      <p className="mf-empty-title type-section-title">{title}</p>
      {description ? <p className="hint type-body-secondary">{description}</p> : null}
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function LoadingState({
  title = 'Loading…',
  description,
  className = '',
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={['mf-loading-state', 'panel-l1', className].filter(Boolean).join(' ')} role="status" aria-busy="true">
      <StatusBadge status="RUNNING">RUNNING</StatusBadge>
      <p className="mf-empty-title type-section-title">{title}</p>
      {description ? <p className="hint type-body-secondary">{description}</p> : null}
    </div>
  );
}

/* ── Tabs ── */

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

export function SegmentedTabs({
  items,
  value,
  onChange,
  label,
  className = '',
}: {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={['mf-segmented', className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={value === item.id ? 'mf-segment active' : 'mf-segment'}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Editor view-mode strip (Progression / Graph / Spatial, or layer modes). */
export function ViewModeTabs({
  items,
  value,
  onChange,
  label = 'View mode',
  className = '',
}: {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={['editor-toolbar', 'mf-view-mode-tabs', className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={label}
    >
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

/* ── Data table ── */

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

/* ── Editor workspace (P1) ── */

export function EditorWorkspace({
  children,
  variant = 'default',
  className = '',
}: {
  children: ReactNode;
  variant?: 'default' | 'world' | 'dungeon';
  className?: string;
}) {
  const variantClass =
    variant === 'world' ? 'world-workspace' : variant === 'dungeon' ? 'dungeon-workspace' : '';
  return (
    <div className={['editor-workspace', variantClass, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export function EditorToolbar({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['editor-toolbar', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  );
}

export function EditorViewport({
  children,
  className = '',
  toolbar,
  footer,
}: {
  children: ReactNode;
  className?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={['panel', 'editor-canvas', 'editor-canvas-fill', className].filter(Boolean).join(' ')}>
      {toolbar}
      <div className="editor-viewport-body">{children}</div>
      {footer ? <div className="editor-canvas-footer">{footer}</div> : null}
    </div>
  );
}

export function EmptyViewport({
  title,
  description,
  meta,
  actions,
  className = '',
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={['empty-viewport', 'mf-empty-viewport', className].filter(Boolean).join(' ')}
      role="status"
    >
      <p className="mf-empty-title">{title}</p>
      {description ? <p className="hint">{description}</p> : null}
      {meta ? <div className="empty-viewport-meta">{meta}</div> : null}
      {actions ? <div className="row empty-viewport-actions">{actions}</div> : null}
    </div>
  );
}

export function InspectorSection({
  title,
  children,
  actions,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <PropertySection title={title} actions={actions} className={className}>
      {children}
    </PropertySection>
  );
}

/* ── Editor workbench aliases + P3 primitives (shared by 2+ screens) ── */

/** Compound editor shell — same layout as EditorWorkspace. */
export function EditorWorkbench({
  children,
  variant = 'default',
  className = '',
}: {
  children: ReactNode;
  variant?: 'default' | 'world' | 'dungeon' | 'preview';
  className?: string;
}) {
  const variantClass =
    variant === 'world'
      ? 'world-workspace'
      : variant === 'dungeon'
        ? 'dungeon-workspace'
        : variant === 'preview'
          ? 'preview-workspace'
          : '';
  return (
    <div className={['editor-workspace', 'editor-workbench', variantClass, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export function EditorCanvas({
  children,
  className = '',
  toolbar,
  footer,
}: {
  children: ReactNode;
  className?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <EditorViewport className={['editor-canvas-shell', className].filter(Boolean).join(' ')} toolbar={toolbar} footer={footer}>
      {children}
    </EditorViewport>
  );
}

export function EditorInspector({
  children,
  title,
  actions,
  empty,
  className = '',
}: {
  children?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <InspectorPanel title={title} actions={actions} empty={empty} className={className}>
      {children}
    </InspectorPanel>
  );
}

export function EditorSection(props: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <InspectorSection {...props} />;
}

export function EditorPropertyGroup({
  title,
  children,
  actions,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <PropertySection title={title} actions={actions} className={['editor-prop-group', className].filter(Boolean).join(' ')}>
      {children}
    </PropertySection>
  );
}

export function EditorPropertyRow(props: {
  label: ReactNode;
  children?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return <PropertyRow {...props} className={['editor-prop-row', props.className ?? ''].filter(Boolean).join(' ')} />;
}

export function EditorDock({
  children,
  className = '',
  tabs,
  activeTab,
  onTabChange,
}: {
  children: ReactNode;
  className?: string;
  tabs?: Array<{ id: string; label: string }>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
}) {
  return (
    <div className={['editor-dock', 'panel', className].filter(Boolean).join(' ')}>
      {tabs && activeTab && onTabChange ? (
        <EditorTabs items={tabs} value={activeTab} onChange={onTabChange} label="Dock" className="editor-dock-tabs" />
      ) : null}
      <div className="editor-dock-body">{children}</div>
    </div>
  );
}

export function EditorTabs({
  items,
  value,
  onChange,
  label,
  className = '',
}: {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}) {
  return <SegmentedTabs items={items} value={value} onChange={onChange} label={label} className={className} />;
}

export function EditorToolButton({
  active,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={['editor-tool-btn', active ? 'active' : '', className].filter(Boolean).join(' ')}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  );
}

export function EditorEmptyState(props: {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <EmptyViewport {...props} className={['editor-empty-state', props.className ?? ''].filter(Boolean).join(' ')} />;
}

export function EditorZoomControls({
  zoom,
  onZoomChange,
  min = 50,
  max = 200,
  step = 25,
  onFit,
  className = '',
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  min?: number;
  max?: number;
  step?: number;
  onFit?: () => void;
  className?: string;
}) {
  return (
    <div className={['editor-zoom-controls', 'row', className].filter(Boolean).join(' ')} role="group" aria-label="Zoom">
      <Button size="sm" onClick={() => onZoomChange(Math.max(min, zoom - step))} aria-label="Zoom out">
        −
      </Button>
      <span className="mono hint" aria-live="polite">
        {zoom}%
      </span>
      <Button size="sm" onClick={() => onZoomChange(Math.min(max, zoom + step))} aria-label="Zoom in">
        +
      </Button>
      {onFit ? (
        <Button size="sm" onClick={onFit}>
          Fit
        </Button>
      ) : null}
    </div>
  );
}

export function EditorStatusBadge({
  status,
  children,
  className = '',
}: {
  status: StatusKind | string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <StatusBadge status={status} className={['editor-status-badge', className].filter(Boolean).join(' ')}>
      {children}
    </StatusBadge>
  );
}

/* ── AI Operations workbench (P4) — shared by Models / Providers / Routing / QA ── */

export function AiOpsWorkbench({
  children,
  className = '',
  variant = 'default',
}: {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'models' | 'providers' | 'routing' | 'qa';
}) {
  return (
    <div
      className={[
        'ai-ops-workbench',
        variant !== 'default' ? `ai-ops-${variant}` : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export function AiOpsSummary({
  children,
  className = '',
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
}) {
  return (
    <div className={['ai-ops-summary', 'panel-l1', className].filter(Boolean).join(' ')} role="region" aria-label={typeof title === 'string' ? title : 'Summary'}>
      {title ? <div className="ai-ops-summary-title type-label">{title}</div> : null}
      <div className="ai-ops-summary-metrics">{children}</div>
    </div>
  );
}

export function AiOpsBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={['ai-ops-body', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function AiOpsContext({
  children,
  title,
  actions,
  className = '',
}: {
  children: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={['ai-ops-context', 'panel-l1', 'mf-panel', className].filter(Boolean).join(' ')}>
      {(title || actions) && <PanelHeader title={title} actions={actions} />}
      <div className="ai-ops-context-body">{children}</div>
    </aside>
  );
}

export function AiOpsPrimary({
  children,
  title,
  actions,
  toolbar,
  className = '',
}: {
  children: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <section className={['ai-ops-primary', 'panel-l1', 'mf-panel', className].filter(Boolean).join(' ')}>
      {(title || actions) && <PanelHeader title={title} actions={actions} />}
      {toolbar ? <div className="ai-ops-primary-toolbar mf-toolbar">{toolbar}</div> : null}
      <div className="ai-ops-primary-body">{children}</div>
    </section>
  );
}

export function AiOpsInspector({
  children,
  title = 'Inspector',
  actions,
  empty,
  className = '',
}: {
  children?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <InspectorPanel
      title={title}
      actions={actions}
      empty={empty}
      className={['ai-ops-inspector', className].filter(Boolean).join(' ')}
    >
      {children}
    </InspectorPanel>
  );
}

export function AiOpsLog({
  children,
  title = 'Diagnostic log',
  actions,
  className = '',
}: {
  children: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['ai-ops-log', 'panel-l1', 'mf-panel', className].filter(Boolean).join(' ')}>
      <PanelHeader title={title} actions={actions} />
      <div className="ai-ops-log-body">{children}</div>
    </div>
  );
}

export function HealthDot({
  status,
  className = '',
  label,
}: {
  status: string;
  className?: string;
  label?: string;
}) {
  const s = String(status).toLowerCase();
  const kind =
    s === 'healthy' || s === 'ok' || s === 'pass' || s === 'passed' || s === 'success'
      ? 'ok'
      : s === 'degraded' || s === 'warn' || s === 'warning' || s === 'checking'
        ? 'warn'
        : s === 'unavailable' || s === 'offline' || s === 'fail' || s === 'failed' || s === 'error' || s === 'disabled'
          ? 'error'
          : '';
  return (
    <span className={['health-dot-wrap', className].filter(Boolean).join(' ')}>
      <span className={['status-dot', kind].filter(Boolean).join(' ')} aria-hidden="true" />
      {label != null ? <span className="health-dot-label">{label}</span> : null}
    </span>
  );
}

export function RejectionTagBadge({
  code,
  label,
  className = '',
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  return (
    <span className={['mf-badge', 'mf-badge-muted', 'rejection-tag', 'mono', className].filter(Boolean).join(' ')} data-tag={code}>
      {label ?? code}
    </span>
  );
}
