import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { StudioProject } from './metroforge-api.js';
import type { NavId } from './nav.js';
import type { GenerationPhaseState } from './types.js';

const STORAGE_KEY = 'metroforge.activeProjectPath';
const MODE_KEY = 'metroforge.creationMode';

export type GeneratorPrefill = {
  description?: string;
  assetType?: string;
  assetId?: string;
};

export type CreationMode = 'manual' | 'assisted' | 'full-ai';

type StudioContextValue = {
  liveGeneration: { events: Record<string, unknown>[]; phases: GenerationPhaseState[] };
  projects: StudioProject[];
  projectsLoading: boolean;
  projectsLoaded: boolean;
  projectsError: string | null;
  selectedPath: string;
  selectedProject?: StudioProject;
  hasActiveProject: boolean;
  setSelectedPath: (path: string) => void;
  refreshProjects: () => Promise<void>;
  navigate: (id: NavId) => void;
  focusRoomId: string;
  setFocusRoomId: (id: string) => void;
  openRoom: (roomId: string) => void;
  focusAssetId: string;
  openAsset: (assetId: string) => void;
  generatorPrefill: GeneratorPrefill | null;
  openGenerator: (prefill?: GeneratorPrefill) => void;
  creationMode: CreationMode;
  setCreationMode: (mode: CreationMode) => void;
  activityOpen: boolean;
  setActivityOpen: (open: boolean) => void;
  focusStoryId: string;
  openStory: (id?: string) => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function readStoredPath(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function readStoredMode(): CreationMode {
  try {
    const value = sessionStorage.getItem(MODE_KEY);
    if (value === 'manual' || value === 'assisted' || value === 'full-ai') return value;
  } catch {
    /* optional */
  }
  return 'assisted';
}

export function StudioProvider({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate: (id: NavId) => void;
}) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const projectRead = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [selectedPath, setSelectedPathState] = useState(readStoredPath);
  const [focusRoomId, setFocusRoomId] = useState('');
  const [focusAssetId, setFocusAssetId] = useState('');
  const [generatorPrefill, setGeneratorPrefill] = useState<GeneratorPrefill | null>(null);
  const [creationMode, setCreationModeState] = useState<CreationMode>(readStoredMode);
  const [activityOpen, setActivityOpen] = useState(true);
  const [focusStoryId, setFocusStoryId] = useState('');
  const [liveGeneration, setLiveGeneration] = useState<StudioContextValue['liveGeneration']>({
    events: [],
    phases: [],
  });

  // Keep real backend events above individual screens so navigation cannot erase a live run.
  useEffect(() => {
    const unsub = window.metroforge?.onGenerationEvent?.((event) => {
      setLiveGeneration((previous) => {
        if (event.type === 'GenerationStarted') return { events: [event], phases: [] };
        const phases = [...previous.phases];
        if (event.type === 'PhaseStarted' || event.type === 'PhaseCompleted') {
          const phase = String(event.phase ?? '');
          const next = {
            phase,
            status: String(event.status ?? 'PENDING'),
            message: typeof event.message === 'string' ? event.message : undefined,
          };
          const index = phases.findIndex((item) => item.phase === phase);
          if (index < 0) phases.push(next);
          else phases[index] = next;
        }
        return { events: [...previous.events.slice(-499), event], phases };
      });
    });
    return () => unsub?.();
  }, []);

  const setCreationMode = useCallback((mode: CreationMode) => {
    setCreationModeState(mode);
    try {
      sessionStorage.setItem(MODE_KEY, mode);
    } catch {
      /* optional */
    }
  }, []);

  const setSelectedPath = useCallback((path: string) => {
    setSelectedPathState(path);
    setGeneratorPrefill(null);
    try {
      if (path) sessionStorage.setItem(STORAGE_KEY, path);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage optional */
    }
  }, []);

  const refreshProjects = useCallback((): Promise<void> => {
    if (projectRead.current) return projectRead.current;
    setProjectsLoading(true);
    const task = Promise.resolve()
      .then(async () => {
        if (!window.metroforge?.listProjects) throw new Error('Desktop bridge unavailable');
        const list = await window.metroforge.listProjects();
        if (!mounted.current) return;
        setProjects(list);
        setProjectsLoaded(true);
        setProjectsError(null);
        setSelectedPathState((prev) => {
          if (prev && list.some((project) => project.path === prev)) return prev;
          const next = list[0]?.path ?? '';
          try {
            if (next) sessionStorage.setItem(STORAGE_KEY, next);
            else sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            /* storage optional */
          }
          return next;
        });
      })
      .catch((error: unknown) => {
        if (mounted.current)
          setProjectsError(error instanceof Error ? error.message : String(error));
        throw error;
      })
      .finally(() => {
        projectRead.current = null;
        if (mounted.current) setProjectsLoading(false);
      });
    projectRead.current = task;
    return task;
  }, []);

  useEffect(() => {
    void refreshProjects().catch(() => {});
  }, [refreshProjects]);

  const openRoom = useCallback(
    (roomId: string) => {
      setFocusRoomId(roomId);
      onNavigate('Rooms');
    },
    [onNavigate],
  );

  const openAsset = useCallback(
    (assetId: string) => {
      setFocusAssetId(assetId);
      onNavigate('Assets');
    },
    [onNavigate],
  );

  const openGenerator = useCallback(
    (prefill?: GeneratorPrefill) => {
      setGeneratorPrefill(prefill ?? null);
      onNavigate('Generate Asset');
    },
    [onNavigate],
  );

  const openStory = useCallback(
    (id?: string) => {
      if (id) setFocusStoryId(id);
      onNavigate('Story');
    },
    [onNavigate],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.path === selectedPath),
    [projects, selectedPath],
  );

  const hasActiveProject = Boolean(selectedProject);

  const value = useMemo(
    () => ({
      liveGeneration,
      projects,
      projectsLoading,
      projectsLoaded,
      projectsError,
      selectedPath,
      selectedProject,
      hasActiveProject,
      setSelectedPath,
      refreshProjects,
      navigate: onNavigate,
      focusRoomId,
      setFocusRoomId,
      openRoom,
      focusAssetId,
      openAsset,
      generatorPrefill,
      openGenerator,
      creationMode,
      setCreationMode,
      activityOpen,
      setActivityOpen,
      focusStoryId,
      openStory,
    }),
    [
      liveGeneration,
      projects,
      projectsLoading,
      projectsLoaded,
      projectsError,
      selectedPath,
      selectedProject,
      hasActiveProject,
      setSelectedPath,
      refreshProjects,
      onNavigate,
      focusRoomId,
      openRoom,
      focusAssetId,
      openAsset,
      generatorPrefill,
      openGenerator,
      creationMode,
      setCreationMode,
      activityOpen,
      focusStoryId,
      openStory,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used within StudioProvider');
  }
  return ctx;
}
