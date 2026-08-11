import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('uncaught ui error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas text-ink">
          <h1 className="font-mono text-lg">Something went wrong</h1>
          <p className="text-sm text-muted">An unexpected error occurred.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-line px-4 py-2 text-sm text-ink hover:bg-panel"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
