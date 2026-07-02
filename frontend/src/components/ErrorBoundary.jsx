import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-brand-dark px-4 text-center">
          <h1 className="font-display text-3xl text-white">Something went wrong</h1>
          <p className="mt-3 max-w-md text-sm text-zinc-400">
            {this.state.error?.message || "The app failed to load."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-brand-red px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
