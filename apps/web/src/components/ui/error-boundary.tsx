"use client";

import type React from "react";
import { Component } from "react";

import { Button } from "./button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main className="grid min-h-screen place-items-center p-6 text-center">
          <div className="grid max-w-md gap-4 rounded-lg border border-border bg-card p-6">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Playfit
            </p>
            <h1 className="font-display text-3xl font-extrabold">Something went wrong</h1>
            <p role="alert" className="text-sm text-muted-foreground">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <div className="flex justify-center gap-2">
              <Button type="button" onClick={this.handleRetry}>
                Try again
              </Button>
              <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
                Reload page
              </Button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
