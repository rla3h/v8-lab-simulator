import { lazy, Suspense } from 'react';
import { useStore } from './store';
import { useAudioSync } from './hooks/useAudioSync';
import { TopBar } from './components/TopBar';
import { Workspace } from './components/Workspace';
import { audioEngine } from './audio/AudioEngine';
import { ErrorBoundary } from './components/ErrorBoundary';

const EngineLibrary = lazy(() => import('./components/EngineLibrary').then((m) => ({ default: m.EngineLibrary })));
const ABCompare = lazy(() => import('./components/ABCompare').then((m) => ({ default: m.ABCompare })));
const AnalysisView = lazy(() => import('./components/AnalysisView').then((m) => ({ default: m.AnalysisView })));
const ProjectManager = lazy(() => import('./components/ProjectManager').then((m) => ({ default: m.ProjectManager })));
const LegalCheck = lazy(() => import('./components/LegalCheck').then((m) => ({ default: m.LegalCheck })));
const ReportView = lazy(() => import('./components/ReportView').then((m) => ({ default: m.ReportView })));

// exposed for debugging / automated verification in the browser
(window as any).__v8lab = { audioEngine };

export function App() {
  useAudioSync();
  const tab = useStore((s) => s.tab);
  const toast = useStore((s) => s.toast);
  return (
    <div className="min-h-full">
      <TopBar />
      <main className="mx-auto max-w-[1680px] p-3 sm:p-4">
        <ErrorBoundary resetKey={tab}>
        <Suspense fallback={<div className="p-6 text-sm text-metal-500">불러오는 중…</div>}>
          {tab === 'workspace' && <Workspace />}
          {tab === 'engines' && <EngineLibrary />}
          {tab === 'ab' && <ABCompare />}
          {tab === 'analysis' && <AnalysisView />}
          {tab === 'project' && <ProjectManager />}
          {tab === 'legal' && <LegalCheck />}
          {tab === 'report' && <ReportView />}
        </Suspense>
        </ErrorBoundary>
      </main>
      {toast && (
        <div role="status" className="no-print fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg border border-teal-600/60 bg-ink-850 px-4 py-2 text-xs text-teal-200 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
