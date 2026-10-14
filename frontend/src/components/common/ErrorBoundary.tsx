import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportClientError } from "../../utils/errorReporting";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const enriched = new Error(`${error.message}\nReact component stack:${info.componentStack}`);
    enriched.stack = error.stack;
    reportClientError(enriched, "react.error-boundary");
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="center-screen" role="alert">
          Something went wrong. The issue has been logged. Please refresh the page.
        </div>
      );
    }
    return this.props.children;
  }
}
