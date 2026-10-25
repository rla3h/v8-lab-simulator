import { Component, type ReactNode } from 'react';

/** Keeps one broken screen from taking down the whole app (and the audio engine with it). */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-4 text-sm">
        <div className="font-semibold text-red-300">이 화면에서 오류가 발생했습니다</div>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-metal-400">{this.state.error.message}</pre>
        <p className="mt-2 text-[11px] text-metal-500">오디오 엔진과 프로젝트 데이터는 유지됩니다. 다른 화면으로 이동하거나 다시 시도하세요.</p>
        <button className="btn mt-3" onClick={() => this.setState({ error: null })}>
          다시 시도
        </button>
      </div>
    );
  }
}
