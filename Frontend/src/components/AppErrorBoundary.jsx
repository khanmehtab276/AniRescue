import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
      errorId: crypto.randomUUID?.() || String(Date.now()),
    };
  }

  componentDidCatch(error, info) {
    console.error('AniRescue UI error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="grid min-h-screen place-items-center bg-stone-50 px-5 py-10 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <section
          role="alert"
          className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-7 text-center shadow-xl dark:border-stone-800 dark:bg-stone-900"
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-2xl dark:bg-rose-950/40">
            🐾
          </div>

          <h1 className="mt-5 text-xl font-black">
            AniRescue needs a quick refresh
          </h1>

          <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
            Something unexpected interrupted this screen. Your account and
            rescue data are still stored on the server.
          </p>

          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 w-full rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.98]"
          >
            Reload AniRescue
          </button>

          {this.state.errorId && (
            <p className="mt-4 text-[10px] font-mono text-stone-400">
              Error ID: {this.state.errorId}
            </p>
          )}
        </section>
      </main>
    );
  }
}
