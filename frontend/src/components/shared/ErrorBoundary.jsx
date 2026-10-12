import { Component } from 'react';
import ErrorFallback from './ErrorFallback.jsx';

// Last-resort error boundary: render errors surface as a retryable page
// (ErrorFallback) instead of a blank screen.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
