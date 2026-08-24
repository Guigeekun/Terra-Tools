export default function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading game data...</div>
        <div className="loading-subtext">Fetching pre-processed databases and assets</div>
      </div>
    </div>
  );
}
