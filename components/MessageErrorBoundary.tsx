"use client";

import React from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary for Message Rendering
 *
 * Industry Standard: Used by all production React apps
 * - Telegram Desktop
 * - WhatsApp Web
 * - Signal
 *
 * Prevents one bad message from crashing the entire conversation view
 */
export class MessageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MessageErrorBoundary] Rendering error:', error, errorInfo);

    // Log to error tracking service (e.g., Sentry)
    // if (window.Sentry) {
    //   window.Sentry.captureException(error, { extra: errorInfo });
    // }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Failed to Load Messages
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              An error occurred while rendering messages
            </p>
            {this.state.error && (
              <p className="text-xs text-gray-500 mb-4 font-mono bg-gray-50 p-2 rounded">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
