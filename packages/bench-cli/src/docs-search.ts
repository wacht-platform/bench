import type { CliContext } from './types.js';
import { field, log, printBannerFor, printError, printJson, section } from './ui.js';

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
    response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
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

  if (options.json) {
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
}
