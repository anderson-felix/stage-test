// No patched stable Monaco release was available on 2026-11-18. Pin the official
// snapshot that bundles DOMPurify 3.4.17; keep package.json and CDN in sync.
export const MONACO_VERSION = "0.58.0-dev-20261111";
export const MONACO_ASSET_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`;

export function configureMonacoLoader(loader: { config: (options: { paths: { vs: string } }) => void }) {
  loader.config({ paths: { vs: MONACO_ASSET_BASE } });
}
