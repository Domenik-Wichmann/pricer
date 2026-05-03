import { FormEvent, ReactNode, useMemo, useState } from 'react';
import {
  Activity,
  Box,
  ClipboardList,
  History,
  Play,
  Save,
  Search,
  ServerCog,
  TerminalSquare,
} from 'lucide-react';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type ApiResult = {
  status: number | null;
  ok: boolean;
  elapsedMs: number;
  body: unknown;
  error: string | null;
};

type TabId =
  | 'health'
  | 'product-search'
  | 'product-detail'
  | 'price-history'
  | 'basket-test'
  | 'raw-api';

const API_BASE_STORAGE_KEY = 'pricer-admin-api-base-url';

const defaultApiBaseUrl =
  import.meta.env.VITE_PRICER_API_BASE_URL ||
  'http://127.0.0.1:5001/pricer-ee440/europe-west1/api';

const tabs: Array<{
  id: TabId;
  label: string;
  icon: ReactNode;
}> = [
  { id: 'health', label: 'Health', icon: <Activity size={18} /> },
  { id: 'product-search', label: 'Product Search', icon: <Search size={18} /> },
  { id: 'product-detail', label: 'Product Detail', icon: <Box size={18} /> },
  { id: 'price-history', label: 'Price History', icon: <History size={18} /> },
  { id: 'basket-test', label: 'Basket Test', icon: <ClipboardList size={18} /> },
  { id: 'raw-api', label: 'Raw API', icon: <TerminalSquare size={18} /> },
];

function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function joinApiPath(baseUrl: string, path: string): string {
  const cleanBaseUrl = normalizeApiBaseUrl(baseUrl);
  const cleanPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;
  return `${cleanBaseUrl}${cleanPath}`;
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return JSON.stringify(value, null, 2);
}

function parseJsonInput(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return JSON.parse(trimmed);
}

async function runApiRequest({
  apiBaseUrl,
  method,
  path,
  body,
}: {
  apiBaseUrl: string;
  method: HttpMethod;
  path: string;
  body?: unknown;
}): Promise<ApiResult> {
  const startedAt = performance.now();

  try {
    const response = await fetch(joinApiPath(apiBaseUrl, path), {
      method,
      headers:
        body === undefined
          ? undefined
          : {
              'content-type': 'application/json',
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const responseText = await response.text();
    const elapsedMs = Math.round(performance.now() - startedAt);

    let parsedBody: unknown = responseText;
    if (responseText) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        parsedBody = responseText;
      }
    }

    return {
      status: response.status,
      ok: response.ok,
      elapsedMs,
      body: parsedBody,
      error: response.ok ? null : response.statusText || 'Request failed.',
    };
  } catch (error) {
    return {
      status: null,
      ok: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      body: null,
      error: error instanceof Error ? error.message : 'Request failed.',
    };
  }
}

function useApiRunner(apiBaseUrl: string) {
  const [result, setResult] = useState<ApiResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function runRequest(options: {
    method: HttpMethod;
    path: string;
    body?: unknown;
  }) {
    setIsLoading(true);
    setResult(null);
    const nextResult = await runApiRequest({
      apiBaseUrl,
      ...options,
    });
    setResult(nextResult);
    setIsLoading(false);
  }

  return { result, isLoading, runRequest };
}

function RequestButton({
  isLoading,
  children,
}: {
  isLoading: boolean;
  children: ReactNode;
}) {
  return (
    <button className="button button-primary" type="submit" disabled={isLoading} title="Run request">
      <Play size={16} />
      {isLoading ? 'Running' : children}
    </button>
  );
}

function ResponsePanel({ result }: { result: ApiResult | null }) {
  if (!result) {
    return (
      <section className="response-panel" aria-label="Response">
        <div className="response-empty">Run a request to see status and JSON output.</div>
      </section>
    );
  }

  return (
    <section className="response-panel" aria-label="Response">
      <div className="response-meta">
        <span className={result.ok ? 'status-pill ok' : 'status-pill error'}>
          {result.status === null ? 'Network error' : `HTTP ${result.status}`}
        </span>
        <span>{result.elapsedMs} ms</span>
        {result.error ? <span className="response-error">{result.error}</span> : null}
      </div>
      <pre>{formatJson(result.body)}</pre>
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function HealthPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);

  function submit(event: FormEvent) {
    event.preventDefault();
    runRequest({ method: 'GET', path: '/' });
  }

  return (
    <ToolPage
      title="Backend Health"
      description="Calls GET / on the Functions Express API and shows the service envelope."
    >
      <form className="tool-form" onSubmit={submit}>
        <RequestButton isLoading={isLoading}>Check Health</RequestButton>
      </form>
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function ProductSearchPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [query, setQuery] = useState('масло');
  const [limit, setLimit] = useState('10');
  const [offset, setOffset] = useState('0');

  function submit(event: FormEvent) {
    event.preventDefault();
    runRequest({
      method: 'POST',
      path: '/products/search',
      body: {
        query,
        layer_mode: 'canonical_with_enrichment',
        limit: Number(limit) || 10,
        offset: Number(offset) || 0,
      },
    });
  }

  return (
    <ToolPage
      title="Product Search"
      description="Calls POST /products/search with the canonical enrichment layer used by the Flutter client."
    >
      <form className="tool-form two-columns" onSubmit={submit}>
        <Field label="Query">
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </Field>
        <Field label="Limit">
          <input type="number" min="1" max="100" value={limit} onChange={(event) => setLimit(event.target.value)} />
        </Field>
        <Field label="Offset">
          <input type="number" min="0" value={offset} onChange={(event) => setOffset(event.target.value)} />
        </Field>
        <div className="form-actions">
          <RequestButton isLoading={isLoading}>Search</RequestButton>
        </div>
      </form>
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function ProductDetailPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [productId, setProductId] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    runRequest({ method: 'GET', path: `/products/${encodeURIComponent(productId.trim())}` });
  }

  return (
    <ToolPage
      title="Product Detail"
      description="Calls GET /products/:id for one canonical product id."
    >
      <form className="tool-form" onSubmit={submit}>
        <Field label="Canonical product id" hint="Tip: copy an id from Product Search results.">
          <input value={productId} onChange={(event) => setProductId(event.target.value)} required />
        </Field>
        <RequestButton isLoading={isLoading}>Fetch Product</RequestButton>
      </form>
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function PriceHistoryPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [sourceProductId, setSourceProductId] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams({
      source_product_id: sourceProductId.trim(),
    });
    runRequest({ method: 'GET', path: `/product-history?${query.toString()}` });
  }

  return (
    <ToolPage
      title="Price History"
      description="Calls GET /product-history?source_product_id=... for raw/source-product price history."
    >
      <form className="tool-form" onSubmit={submit}>
        <Field label="Source product id" hint="Product detail responses include source/mapping ids when available.">
          <input value={sourceProductId} onChange={(event) => setSourceProductId(event.target.value)} required />
        </Field>
        <RequestButton isLoading={isLoading}>Fetch History</RequestButton>
      </form>
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function BasketTestPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [itemsText, setItemsText] = useState('масло\nкисело мляко');
  const [strategy, setStrategy] = useState('single_store');
  const [includeExplanation, setIncludeExplanation] = useState(true);
  const [includeConvenience, setIncludeConvenience] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const items = itemsText
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    runRequest({
      method: 'POST',
      path: '/basket/optimize',
      body: {
        items,
        layer_mode: 'canonical_with_enrichment',
        optimizer_options: {
          strategy,
          include_explanation: includeExplanation,
          include_convenience_scoring: includeConvenience,
        },
        ...(includeConvenience ? { user_context: { single_store_preferred: true } } : {}),
      },
    });
  }

  return (
    <ToolPage
      title="Basket Test"
      description="Calls POST /basket/optimize with newline or comma separated item text."
    >
      <form className="tool-form two-columns" onSubmit={submit}>
        <Field label="Items">
          <textarea value={itemsText} onChange={(event) => setItemsText(event.target.value)} rows={8} />
        </Field>
        <div className="stack">
          <Field label="Strategy">
            <select value={strategy} onChange={(event) => setStrategy(event.target.value)}>
              <option value="single_store">single_store</option>
              <option value="multi_store">multi_store</option>
            </select>
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              checked={includeExplanation}
              onChange={(event) => setIncludeExplanation(event.target.checked)}
            />
            Include explanation
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={includeConvenience}
              onChange={(event) => setIncludeConvenience(event.target.checked)}
            />
            Include convenience scoring
          </label>
          <div className="form-actions">
            <RequestButton isLoading={isLoading}>Optimize</RequestButton>
          </div>
        </div>
      </form>
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function RawApiPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState('/market/overview');
  const [bodyText, setBodyText] = useState('{\n  "query": "масло"\n}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setJsonError(null);

    try {
      const body = method === 'GET' || method === 'DELETE' ? undefined : parseJsonInput(bodyText);
      runRequest({ method, path, body });
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON body.');
    }
  }

  return (
    <ToolPage
      title="Raw API"
      description="Manually calls any backend route by method, path, and optional JSON body."
    >
      <form className="tool-form" onSubmit={submit}>
        <div className="inline-fields">
          <Field label="Method">
            <select value={method} onChange={(event) => setMethod(event.target.value as HttpMethod)}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </Field>
          <Field label="Path">
            <input value={path} onChange={(event) => setPath(event.target.value)} />
          </Field>
        </div>
        <Field label="JSON body" hint="Ignored for GET and DELETE in this V0 console.">
          <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} rows={10} />
        </Field>
        {jsonError ? <div className="form-error">{jsonError}</div> : null}
        <RequestButton isLoading={isLoading}>Send Request</RequestButton>
      </form>
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function ToolPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="tool-page">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('health');
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    return normalizeApiBaseUrl(localStorage.getItem(API_BASE_STORAGE_KEY) || defaultApiBaseUrl);
  });
  const [draftApiBaseUrl, setDraftApiBaseUrl] = useState(apiBaseUrl);

  const activePage = useMemo(() => {
    switch (activeTab) {
      case 'health':
        return <HealthPage apiBaseUrl={apiBaseUrl} />;
      case 'product-search':
        return <ProductSearchPage apiBaseUrl={apiBaseUrl} />;
      case 'product-detail':
        return <ProductDetailPage apiBaseUrl={apiBaseUrl} />;
      case 'price-history':
        return <PriceHistoryPage apiBaseUrl={apiBaseUrl} />;
      case 'basket-test':
        return <BasketTestPage apiBaseUrl={apiBaseUrl} />;
      case 'raw-api':
        return <RawApiPage apiBaseUrl={apiBaseUrl} />;
    }
  }, [activeTab, apiBaseUrl]);

  function saveApiBaseUrl(event: FormEvent) {
    event.preventDefault();
    const nextUrl = normalizeApiBaseUrl(draftApiBaseUrl);
    localStorage.setItem(API_BASE_STORAGE_KEY, nextUrl);
    setApiBaseUrl(nextUrl);
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <ServerCog size={28} />
          <div>
            <h1>Pricer Admin</h1>
            <span>Test Console V0</span>
          </div>
        </div>
        <nav aria-label="Admin console sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? 'nav-button active' : 'nav-button'}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <form className="api-base-form" onSubmit={saveApiBaseUrl}>
            <Field label="API base URL">
              <input
                value={draftApiBaseUrl}
                onChange={(event) => setDraftApiBaseUrl(event.target.value)}
                spellCheck={false}
              />
            </Field>
            <button className="button" type="submit" title="Save API base URL">
              <Save size={16} />
              Save
            </button>
          </form>
          <p>
            TODO: add Firebase Auth or an equivalent admin gate before exposing this beyond trusted
            developer environments.
          </p>
        </header>
        {activePage}
      </section>
    </main>
  );
}
