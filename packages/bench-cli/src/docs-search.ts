import { httpFetch } from './http.js';
import type { CliContext } from './types.js';
import { field, log, muted, printBannerFor, printError, printJson, section } from './ui.js';

const DEFAULT_DOCS_URL = 'https://wacht.dev/docs';

interface SearchHit {
  id: string;
  type: 'page' | 'heading' | 'text';
  content: string;
  url: string;
  breadcrumbs?: string[];
}

export interface DocsSearchOptions {
  query: string;
  baseUrl?: string;
  limit?: number;
  json?: boolean;
}

export async function docsSearch(ctx: CliContext, options: DocsSearchOptions): Promise<void> {
  const baseUrl = (options.baseUrl ?? process.env.WACHT_DOCS_URL ?? DEFAULT_DOCS_URL).replace(/\/+$/, '');
  const endpoint = `${baseUrl}/api/search?query=${encodeURIComponent(options.query)}`;

  let response: Response;
  try {
    response = await httpFetch(endpoint, { headers: { Accept: 'application/json' } });
  } catch (error) {
    printError(error);
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    printError(new Error(`docs search failed: ${response.status} ${response.statusText} (${endpoint})`));
    process.exitCode = 1;
    return;
  }

  const raw = (await response.json()) as SearchHit[];
  if (!Array.isArray(raw)) {
    printError(new Error('unexpected docs search response shape'));
    process.exitCode = 1;
    return;
  }

  const pages = new Map<string, SearchHit>();
  const snippets = new Map<string, SearchHit[]>();
  for (const hit of raw) {
    const pageUrl = hit.url.split('#')[0];
    if (hit.type === 'page') {
      pages.set(pageUrl, hit);
    } else {
      if (!snippets.has(pageUrl)) snippets.set(pageUrl, []);
      snippets.get(pageUrl)!.push(hit);
    }
  }
  const orderedPages = Array.from(pages.values());
  const sliced = options.limit ? orderedPages.slice(0, options.limit) : orderedPages;

  if (ctx.json || options.json) {
    printJson({
      ok: true,
      query: options.query,
      baseUrl,
      results: sliced.map((page) => ({
        title: page.content,
        url: `${baseUrl}${page.url}`,
        breadcrumbs: page.breadcrumbs ?? [],
        snippets: (snippets.get(page.url) ?? []).map((s) => ({
          text: s.content,
          url: `${baseUrl}${s.url}`,
        })),
      })),
    });
    return;
  }

  printBannerFor(ctx);
  log(ctx, section('Docs Search'));
  log(ctx, field('Query', options.query));
  log(ctx, field('Source', baseUrl));
  log(ctx, field('Results', String(sliced.length)));
  log(ctx, '');

  if (sliced.length === 0) {
    log(ctx, 'No matches.');
    return;
  }

  for (const page of sliced) {
    const breadcrumbs = page.breadcrumbs?.length ? page.breadcrumbs.join(' › ') : '';
    log(ctx, `• ${page.content}`);
    if (breadcrumbs) log(ctx, `    ${breadcrumbs}`);
    log(ctx, `    ${baseUrl}${page.url}`);
    const pageSnippets = snippets.get(page.url) ?? [];
    for (const s of pageSnippets.slice(0, 3)) {
      const trimmed = s.content.length > 140 ? `${s.content.slice(0, 137).trimEnd()}…` : s.content;
      log(ctx, `      – ${trimmed}`);
    }
    log(ctx, '');
  }

  if (!ctx.quiet) {
    log(ctx, muted('Read a full page with `wacht docs get <path>` (e.g. `wacht docs get /sdks/nextjs/middleware`).'));
  }
}

export interface DocsGetOptions {
  path: string;
  baseUrl?: string;
  json?: boolean;
}

/**
 * Normalize whatever the caller passes (a docs path, a `/docs/...` path, a full
 * URL, or one that already ends in `content.md`) down to the page's slug segments.
 */
function normalizeDocPath(input: string): string {
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      // fall through and treat it as a plain path
    }
  }
  value = value.replace(/^\/+/, '').replace(/\/+$/, '');
  value = value.replace(/^docs\//, '');
  // tolerate a pasted markdown URL: .../sdks/node/content.md → sdks/node
  value = value.replace(/\/content\.md$/i, '').replace(/\.mdx?$/i, '');
  return value;
}

export async function docsGet(ctx: CliContext, options: DocsGetOptions): Promise<void> {
  const baseUrl = (options.baseUrl ?? process.env.WACHT_DOCS_URL ?? DEFAULT_DOCS_URL).replace(/\/+$/, '');
  const slug = normalizeDocPath(options.path);
  if (!slug) {
    printError(new Error('Pass a docs path, for example `wacht docs get /sdks/nextjs/middleware`.'));
    process.exitCode = 1;
    return;
  }

  const docPath = `/${slug}`;
  const url = `${baseUrl}/llms.mdx/docs/${slug}/content.md`;

  let response: Response;
  try {
    response = await httpFetch(url, { headers: { Accept: 'text/markdown' } });
  } catch (error) {
    printError(error);
    process.exitCode = 1;
    return;
  }

  if (response.status === 404) {
    printError(new Error(`No docs page at ${docPath}. Run \`wacht docs search <terms>\` to find the right path.`));
    process.exitCode = 1;
    return;
  }
  if (!response.ok) {
    printError(new Error(`docs get failed: ${response.status} ${response.statusText} (${url})`));
    process.exitCode = 1;
    return;
  }

  const markdown = (await response.text()).trim();

  if (ctx.json || options.json) {
    printJson({ ok: true, path: docPath, url, markdown });
    return;
  }

  if (!ctx.quiet) {
    log(ctx, muted(`# source: ${baseUrl}${docPath}`));
    log(ctx, '');
  }
  // The page body is the deliverable here — print it raw so it's pipeable.
  console.log(markdown);
}
