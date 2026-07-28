import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/primitives";

/**
 * Shared recovery card for a crashed render.
 *
 * Two things can swallow a render error in this app, and they need different
 * wiring: TanStack Router catches anything thrown inside a route component
 * (see `defaultErrorComponent` in router.tsx), while ErrorBoundary below
 * catches everything outside the router. Both render this.
 */
export function ErrorFallback({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="app-backdrop grid h-full place-items-center p-6">
      <div className="max-w-sm text-center">
        <p className="font-display text-lg font-medium">Something broke</p>
        <p className="mt-1 text-sm text-muted">
          {error?.message || "An unexpected error occurred while rendering."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="primary" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
            {onRetry ? "Try again" : "Reload"}
          </Button>
          <Button
            onClick={() => {
              // Clear client-side state that might itself be the cause.
              try {
                sessionStorage.clear();
              } catch {
                /* storage unavailable */
              }
              window.location.href = "/login";
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last line of defence against a blank page. React unmounts the whole tree when
 * a render throws, so without a boundary the user is left staring at an empty
 * document with no way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing ships these anywhere yet, but a blank page with a silent console
    // is the worst possible combination.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorFallback error={error} onRetry={() => this.setState({ error: null })} />;
  }
}
