import React from 'react';
import { recordMobileObservabilityEvent } from '../../runtime/mobileObservability';

type Props = {
  children: React.ReactNode;
  name: string;
  onClose?: () => void;
};

type State = { hasError: boolean };

export default class MobileHomeErrorBoundary extends React.Component<Props, State> {
  public props: Props;
  public state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    recordMobileObservabilityEvent({
      type: 'mobile_shell.render_error',
      level: 'error',
      message: String((error as { message?: unknown })?.message || `${this.props.name} render failed.`),
      metadata: {
        surface: this.props.name,
        componentStack: String(info.componentStack || '').slice(0, 1200)
      }
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section
        className="mx-auto flex min-h-[42vh] w-full max-w-md items-center justify-center px-4 py-8"
        role="alert"
        aria-live="assertive"
        data-testid="mobile-home-recovery"
      >
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl" aria-hidden>
            !
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">This mobile panel needs a refresh</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your account and saved work are still safe. Retry the panel or return to the home feed.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              onClick={() => (this as any).setState({ hasError: false })}
            >
              Retry panel
            </button>
            {this.props.onClose ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                onClick={this.props.onClose}
              >
                Back to home
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }
}
