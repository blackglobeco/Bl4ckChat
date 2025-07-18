import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-red-400 font-mono flex items-center justify-center">
          <div className="max-w-md text-center p-8 border border-red-500 rounded">
            <h1 className="text-2xl mb-4">⚠️ Something went wrong</h1>
            <p className="mb-4">
              An error occurred in the BitChat application.
            </p>
            {this.state.error && (
              <details className="text-left text-xs mb-4 bg-red-900 p-4 rounded">
                <summary className="cursor-pointer">Error Details</summary>
                <pre className="mt-2 overflow-x-auto">
                  {this.state.error.message}
                  {this.state.error.stack && (
                    <>
                      {"\n"}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
