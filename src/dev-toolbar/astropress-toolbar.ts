import { defineToolbarApp } from 'astro/toolbar';

interface AstroPressRouteInfo {
  candidateTemplates: string[];
  kind: string;
  liveCollection: {
    collection: string;
    entryId: string;
    cacheHint: unknown;
  } | null;
  matched: boolean;
  page: number | null;
  path: string;
  postType: string | null;
  slug: string | null;
  template: string | null;
  templateSource: 'project' | 'astropress' | null;
  totalPages: number | null;
}

declare global {
  interface Window {
    __ASTROPRESS_ROUTE_INFO__?: AstroPressRouteInfo;
  }
}

export default defineToolbarApp({
  init(canvas) {
    render(canvas);

    window.addEventListener('astropress:route-info', () => render(canvas));
    document.addEventListener('astro:after-swap', () => render(canvas));
  },
});

function render(canvas: ShadowRoot) {
  const info = window.__ASTROPRESS_ROUTE_INFO__;

  canvas.innerHTML = '';

  const panel = document.createElement('astro-dev-toolbar-window');
  panel.innerHTML = `
    <style>
      :host astro-dev-toolbar-window {
        width: min(520px, calc(100vw - 48px));
        max-height: min(640px, calc(100vh - 120px));
        overflow-y: auto;
        color-scheme: dark;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 18px;
      }

      h1 {
        color: #fff;
        font-size: 22px;
        line-height: 1.2;
        margin: 0;
      }

      .badge {
        border: 1px solid rgba(145, 152, 173, 0.4);
        border-radius: 999px;
        color: rgba(204, 206, 216, 1);
        font-size: 12px;
        padding: 4px 8px;
      }

      .grid {
        display: grid;
        gap: 10px;
      }

      .row {
        border: 1px solid rgba(52, 56, 65, 1);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.04);
        padding: 10px 12px;
      }

      .label {
        color: rgba(145, 152, 173, 1);
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
      }

      code {
        color: rgba(224, 204, 250, 1);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
        overflow-wrap: anywhere;
      }

      ul {
        display: grid;
        gap: 6px;
        margin: 8px 0 0;
        padding-left: 18px;
      }

      li {
        color: rgba(204, 206, 216, 1);
      }

      p {
        color: rgba(204, 206, 216, 1);
        line-height: 1.5;
        margin: 0;
      }
    </style>
    ${info ? renderInfo(info) : renderEmptyState()}
  `;

  canvas.append(panel);
}

function renderInfo(info: AstroPressRouteInfo) {
  return `
    <header>
      <h1>AstroPress route</h1>
      <span class="badge">${escapeHtml(info.matched ? info.kind : '404')}</span>
    </header>
    <section class="grid">
      ${row('URL path', info.path)}
      ${row('Selected template', info.template ?? 'No template matched')}
      ${row('Template source', info.templateSource ?? '—')}
      ${row('Live collection', info.liveCollection ? `${info.liveCollection.collection} → ${info.liveCollection.entryId}` : '—')}
      ${row('Post type', info.postType ?? '—')}
      ${row('Slug', info.slug ?? '—')}
      ${row('Pagination', paginationLabel(info))}
      <div class="row">
        <span class="label">Template candidates</span>
        <ul>
          ${info.candidateTemplates.map((candidate) => `<li><code>${escapeHtml(candidate)}</code></li>`).join('')}
        </ul>
      </div>
    </section>
  `;
}

function renderEmptyState() {
  return `
    <header>
      <h1>AstroPress route</h1>
      <span class="badge">No route data</span>
    </header>
    <p>Open an Astro-rendered WordPress frontend route to see template hierarchy information here.</p>
  `;
}

function row(label: string, value: string) {
  return `
    <div class="row">
      <span class="label">${escapeHtml(label)}</span>
      <code>${escapeHtml(value)}</code>
    </div>
  `;
}

function paginationLabel(info: AstroPressRouteInfo) {
  if (!info.page && !info.totalPages) {
    return '—';
  }

  return `${info.page ?? 1}${info.totalPages ? ` / ${info.totalPages}` : ''}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
