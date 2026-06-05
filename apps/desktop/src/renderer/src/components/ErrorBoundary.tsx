import React from "react";
import i18n from "@/i18n";

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

interface Props {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary] caught render error", error, info);
    this.setState({ info });
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-bg-base text-text-primary p-8 overflow-y-auto">
          <div className="max-w-3xl">
            <h1 className="text-xl font-bold text-danger mb-3">{i18n.t("errors.renderError")}</h1>
            <p className="text-sm text-text-secondary mb-4">
              {i18n.t("errors.renderErrorDesc")}
            </p>
            <pre className="bg-bg-elevated border border-border-subtle rounded-md p-4 text-xs text-danger overflow-x-auto">
              {this.state.error.name}: {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack ?? ""}
              {this.state.info?.componentStack
                ? `\n\nComponent stack:${this.state.info.componentStack}`
                : ""}
            </pre>
            <button
              onClick={() => this.setState({ error: null, info: null })}
              className="mt-4 px-4 py-2 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover"
            >
              {i18n.t("errors.tryAgain")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
