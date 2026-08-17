import { useState, useEffect, useMemo } from 'react';
import './studio/metroforge-api.js';
import { GenerationStudio } from './studio/GenerationStudio.js';
import { AssetsGallery } from './studio/AssetsGallery.js';
import { WorldEditor } from './studio/WorldEditor.js';
import { RoomEditor } from './studio/RoomEditor.js';
import { ProjectDashboard } from './studio/ProjectDashboard.js';
import { GenerateAssetScreen } from './studio/GenerateAsset.js';
import { RoutingInspector } from './studio/RoutingInspector.js';
import { DungeonEditor } from './studio/DungeonEditor.js';
import { ExportScreen } from './studio/ExportScreen.js';
import { StatusBar } from './studio/StatusBar.js';
import { GoToPalette } from './studio/GoToPalette.js';
import { NAV_GROUPS, ALL_NAV_ITEMS, type NavId } from './studio/nav.js';
import { StudioProvider, useStudio } from './studio/StudioContext.js';
import { ProjectSelect } from './studio/ProjectSelect.js';
import { QAScreen } from './studio/QAScreen.js';
import { ModelsScreen } from './studio/ModelsScreen.js';
import { ProvidersScreen } from './studio/ProvidersScreen.js';
import { CreateScreen } from './studio/CreateScreen.js';
import { ProjectsScreen } from './studio/ProjectsScreen.js';
import { PreviewScreen } from './studio/PreviewScreen.js';
import { SettingsScreen } from './studio/SettingsScreen.js';
import { VisualReviewScreen } from './studio/VisualReviewScreen.js';
import { HealthPopover } from './studio/HealthPopover.js';

function navBreadcrumb(activeNav: NavId): { group: string; label: string } {
  for (const group of NAV_GROUPS) {
    const hit = group.items.find((item) => item.id === activeNav);
    if (hit) return { group: group.label, label: hit.label };
  }
  const fallback = ALL_NAV_ITEMS.find((item) => item.id === activeNav);
  return { group: 'Studio', label: fallback?.label ?? activeNav };
}

function TopCommandBar({
  version,
  activeNav,
  onNavigate,
  onOpenPalette,
  sidebarCollapsed,
  onToggleSidebar,
  bridgeReady,
}: {
  version: string;
  activeNav: NavId;
  onNavigate: (id: NavId) => void;
  onOpenPalette: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  bridgeReady: boolean | null;
}) {
  const { selectedProject, hasActiveProject } = useStudio();
  const crumb = useMemo(() => navBreadcrumb(activeNav), [activeNav]);

  return (
    <header className="topbar" role="banner">
      <div className="topbar-brand">
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Expand nav (Ctrl+B)' : 'Collapse nav (Ctrl+B)'}
          aria-label={sidebarCollapsed ? 'Expand navigation (Ctrl+B)' : 'Collapse navigation (Ctrl+B)'}
          aria-pressed={sidebarCollapsed}
        >
          <span className="topbar-hamburger" aria-hidden="true" />
        </button>
        <div className="brand-mark" aria-hidden="true">
          MF
        </div>
        <div className="brand-copy">
          <h1>MetroForge</h1>
          <span className="version">{version}</span>
        </div>
      </div>

      <div className="topbar-project">
        <ProjectSelect compact />
        <nav className="topbar-breadcrumb type-caption" aria-label="Workspace context">
          <span className="topbar-crumb-group">{crumb.group}</span>
          <span className="topbar-crumb-sep" aria-hidden="true">
            /
          </span>
          <span className="topbar-crumb-page">{crumb.label}</span>
          {selectedProject?.title || selectedProject?.slug ? (
            <>
              <span className="topbar-crumb-sep" aria-hidden="true">
                ·
              </span>
              <span className="topbar-crumb-project" title={selectedProject.path}>
                {selectedProject.title ?? selectedProject.slug}
              </span>
            </>
          ) : (
            <>
              <span className="topbar-crumb-sep" aria-hidden="true">
                ·
              </span>
              <span className="topbar-crumb-project muted">No project</span>
            </>
          )}
        </nav>
      </div>

      <div className="topbar-actions">
        <button type="button" className="topbar-action topbar-jump" onClick={onOpenPalette} title="Jump (Ctrl+K)">
          <span className="topbar-jump-label">Jump</span>
          <kbd>Ctrl+K</kbd>
        </button>
        <button
          type="button"
          className={activeNav === 'Create' ? 'topbar-action active' : 'topbar-action'}
          onClick={() => onNavigate('Create')}
        >
          New Game
        </button>
        <button
          type="button"
          className={activeNav === 'Studio' ? 'topbar-action active' : 'topbar-action'}
          onClick={() => onNavigate('Studio')}
        >
          Studio
        </button>
        <button
          type="button"
          className={activeNav === 'Preview' ? 'topbar-action active' : 'topbar-action'}
          onClick={() => onNavigate('Preview')}
          disabled={!hasActiveProject}
        >
          Preview
        </button>
        <HealthPopover bridgeReady={bridgeReady} onOpenProviders={() => onNavigate('Providers')} />
      </div>
    </header>
  );
}

export function App() {
  const [activeNav, setActiveNav] = useState<NavId>('Dashboard');
  const [version, setVersion] = useState('MetroForge');
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1449px)').matches,
  );

  useEffect(() => {
    const bridge = window.metroforge;
    if (!bridge) {
      setBridgeReady(false);
      return;
    }
    setBridgeReady(true);
    bridge.getVersion().then(setVersion).catch(() => {});
  }, []);

  useEffect(() => {
    const compact = window.matchMedia('(max-width: 1449px)');
    const iconOnly = window.matchMedia('(max-width: 1199px)');
    const onChange = () => {
      if (iconOnly.matches || compact.matches) setSidebarCollapsed(true);
      else setSidebarCollapsed(false);
    };
    onChange();
    compact.addEventListener('change', onChange);
    iconOnly.addEventListener('change', onChange);
    return () => {
      compact.removeEventListener('change', onChange);
      iconOnly.removeEventListener('change', onChange);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setSidebarCollapsed((c) => !c);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        const hit = NAV_GROUPS.flatMap((g) => [...g.items]).find(
          (item) => 'shortcut' in item && item.shortcut === event.key,
        );
        if (hit) {
          event.preventDefault();
          setActiveNav(hit.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <StudioProvider onNavigate={setActiveNav}>
      <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <a className="skip-link" href="#studio-main">
          Skip to workspace
        </a>
        <TopCommandBar
          version={version}
          activeNav={activeNav}
          onNavigate={setActiveNav}
          onOpenPalette={() => setPaletteOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          bridgeReady={bridgeReady}
        />
        <aside className="sidebar" aria-label="Studio navigation">
          <nav className="sidebar-nav" aria-label="Studio">
            {NAV_GROUPS.map((group) => (
              <div key={group.id} className="nav-group">
                <span className="nav-group-label">{group.label}</span>
                {group.items.map((item) => {
                  const shortcut =
                    'shortcut' in item && item.shortcut ? `Ctrl+${item.shortcut}` : undefined;
                  const tooltip = shortcut ? `${item.label} (${shortcut})` : item.label;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
                      onClick={() => setActiveNav(item.id)}
                      aria-current={activeNav === item.id ? 'page' : undefined}
                      aria-label={tooltip}
                      title={tooltip}
                      data-abbrev={item.label
                        .split(/\s+/)
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    >
                      <span className="nav-item-label">{item.label}</span>
                      {shortcut ? <span className="nav-shortcut">{shortcut}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <main className="content" id="studio-main">
          {bridgeReady === false && (
            <div className="result error" style={{ marginBottom: '1rem' }}>
              Desktop bridge unavailable — restart with <code>pnpm dev:desktop</code> from the repo
              root. If this persists, rebuild the Electron preload bundle.
            </div>
          )}
          {activeNav === 'Dashboard' && <ProjectDashboard />}
          {activeNav === 'Studio' && <GenerationStudio />}
          {activeNav === 'Create' && <CreateScreen bridgeReady={bridgeReady} />}
          {activeNav === 'Projects' && <ProjectsScreen />}
          {activeNav === 'Assets' && <AssetsGallery />}
          {activeNav === 'Generate Asset' && <GenerateAssetScreen />}
          {activeNav === 'World' && <WorldEditor />}
          {activeNav === 'Rooms' && <RoomEditor />}
          {activeNav === 'Dungeon' && <DungeonEditor />}
          {activeNav === 'Preview' && <PreviewScreen />}
          {activeNav === 'Models' && <ModelsScreen />}
          {activeNav === 'Providers' && <ProvidersScreen />}
          {activeNav === 'Routing' && <RoutingInspector />}
          {activeNav === 'QA' && <QAScreen />}
          {activeNav === 'Visual Review' && <VisualReviewScreen />}
          {activeNav === 'Export' && <ExportScreen />}
          {activeNav === 'Settings' && <SettingsScreen />}
        </main>
        <StatusBar version={version} bridgeReady={bridgeReady} activeNav={activeNav} />
        <GoToPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSelect={setActiveNav} />
      </div>
    </StudioProvider>
  );
}
