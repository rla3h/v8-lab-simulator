import { LibraryPanel } from './LibraryPanel';
import { ExhaustBuilder } from './ExhaustBuilder';
import { PartInspector } from './PartInspector';
import { ControlPanel } from './ControlPanel';
import { LiveScope } from './LiveScope';
import { Card } from './ui';
import { useStore } from '../store';

export function Workspace() {
  const tel = useStore((s) => s.telemetry);
  const monitor = useStore((s) => s.controls.monitor);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_330px] lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="order-3 lg:col-span-2 xl:order-1 xl:col-span-1">
          <LibraryPanel />
        </div>
        <div className="order-1 flex min-w-0 flex-col gap-3 xl:order-2">
          <ExhaustBuilder />
          <PartInspector />
        </div>
        <div className="order-2 xl:order-3">
          <ControlPanel />
        </div>
      </div>
      <Card
        title="Playback · Analysis Timeline"
        right={
          <span className="num text-[10px] text-metal-500">
            청취 {monitor} · {tel ? `${Math.round(tel.rpm)} rpm · 스로틀 ${Math.round(tel.throttle * 100)}%` : '정지'}
          </span>
        }
      >
        <LiveScope />
      </Card>
    </div>
  );
}
