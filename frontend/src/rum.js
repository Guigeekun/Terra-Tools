import { datadogRum } from '@datadog/browser-rum';
import { reactPlugin } from '@datadog/browser-rum-react';

// Datadog RUM (browser telemetry): views, JS errors, resource timing, user
// actions and long tasks, reported straight from visitors' browsers to
// Datadog — no server-side agent involved. Credentials come from Vite env
// vars so nothing is sent from local dev or forks without them; production
// values live in frontend/.env.production (see .env.example). The client
// token is public by design — the API key never belongs in the frontend.
//
// Telemetry must never take the app down: init is fail-safe, and a refused
// Datadog (expired trial, blocked intake) only makes the SDK drop its event
// batches — every entry point below is guarded so the app runs normally
// without RUM.
const rum = initRum();

function initRum() {
    // Telemetry is for the deployed site only: never initialize outside a
    // production build, whatever env files a developer has locally.
    if (import.meta.env.MODE !== 'production') return null;

    // Ship-without-RUM kill switch, e.g. while the Datadog trial is paused.
    if (['false', '0'].includes(import.meta.env.VITE_DD_RUM_ENABLED)) return null;

    const applicationId = import.meta.env.VITE_DD_RUM_APPLICATION_ID;
    const clientToken = import.meta.env.VITE_DD_RUM_CLIENT_TOKEN;
    if (!applicationId || !clientToken) return null;

    try {
        const remoteConfigurationId = import.meta.env.VITE_DD_RUM_REMOTE_CONFIG_ID;
        datadogRum.init({
            applicationId,
            clientToken,
            site: import.meta.env.VITE_DD_SITE || 'datadoghq.eu',
            service: import.meta.env.VITE_DD_SERVICE || 'terra-tools-web',
            env: import.meta.env.VITE_DD_ENV || 'prod',
            version: import.meta.env.VITE_DD_VERSION,
            remoteConfiguration: remoteConfigurationId
                ? { id: remoteConfigurationId }
                : undefined,
            sessionSampleRate: 100,
            sessionReplaySampleRate: 20,
            trackResources: true,
            trackUserInteractions: true,
            trackLongTasks: true,
            // The app runs on the hash router in router.js, not React Router, so
            // views are started manually from useHashRoute().
            trackViewsManually: true,
            defaultPrivacyLevel: 'mask-user-input',
            plugins: [reactPlugin({ router: false })],
        });
        return datadogRum;
    } catch (error) {
        // init() validates credentials and throws on a bad configuration —
        // that must never break the app boot.
        console.info('Datadog RUM disabled:', error);
        return null;
    }
}

let startedTab;

// Start a RUM view per tab (called from useHashRoute). Query-param changes
// inside a tab (opened modal, prefilled search) refresh the view context
// instead of splitting the tab into single-modal views; the full hash,
// including '#/docs/<slug>', is captured automatically as view.url_hash.
export function trackRumView({ tab, params }) {
    if (!rum) return;
    try {
        if (tab !== startedTab) {
            rum.startView(tab);
            startedTab = tab;
        } else if (params && Object.keys(params).length > 0) {
            rum.setViewContext?.({ tab, params });
        }
    } catch {
        // A refused or broken RUM session must never break routing.
    }
}
