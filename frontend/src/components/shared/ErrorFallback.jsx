// Last-resort error boundary fallback: render errors surface as a retryable
// page instead of a blank screen, and reach Datadog RUM (via the boundary in
// main.jsx) with the React component stack.
export default function ErrorFallback({ resetError, error }) {
  return (
    <div style={{ margin: '4rem auto', maxWidth: 480, textAlign: 'center' }}>
      <h1>Something went wrong</h1>
      <p>
        Oops! <strong>{String(error)}</strong>
      </p>
      <button onClick={resetError}>Retry</button>
    </div>
  );
}
