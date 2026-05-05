import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Box,
  ClipboardList,
  Copy,
  History,
  Home,
  ListChecks,
  Tags,
  Play,
  Save,
  Search,
  ServerCog,
  TerminalSquare,
  UploadCloud,
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
  | 'home-summary'
  | 'product-search'
  | 'product-detail'
  | 'price-history'
  | 'price-lookup'
  | 'shopping-intent'
  | 'basket-test'
  | 'ingest-jobs'
  | 'raw-api';

const API_BASE_STORAGE_KEY = 'pricer-admin-api-base-url';
const DEPLOYED_API_BASE_URL = 'https://europe-west1-pricer-ee440.cloudfunctions.net/api';
const LOCAL_API_BASE_URL = 'http://127.0.0.1:5001/pricer-ee440/europe-west1/api';

function getDefaultApiBaseUrl(): string {
  if (import.meta.env.VITE_PRICER_API_BASE_URL) {
    return import.meta.env.VITE_PRICER_API_BASE_URL;
  }
  if (isHostedConsole()) {
    return DEPLOYED_API_BASE_URL;
  }
  return LOCAL_API_BASE_URL;
}

const defaultApiBaseUrl = getDefaultApiBaseUrl();

const tabs: Array<{
  id: TabId;
  label: string;
  icon: ReactNode;
}> = [
  { id: 'health', label: 'Health', icon: <Activity size={18} /> },
  { id: 'home-summary', label: 'Home Summary', icon: <Home size={18} /> },
  { id: 'product-search', label: 'Product Search', icon: <Search size={18} /> },
  { id: 'product-detail', label: 'Product Detail', icon: <Box size={18} /> },
  { id: 'price-history', label: 'Price History', icon: <History size={18} /> },
  { id: 'price-lookup', label: 'Price Lookup', icon: <Tags size={18} /> },
  { id: 'shopping-intent', label: 'Shopping Intent', icon: <ListChecks size={18} /> },
  { id: 'basket-test', label: 'Basket Test', icon: <ClipboardList size={18} /> },
  { id: 'ingest-jobs', label: 'Ingest / Data Jobs', icon: <UploadCloud size={18} /> },
  { id: 'raw-api', label: 'Raw API', icon: <TerminalSquare size={18} /> },
];

function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function isHostedConsole(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('web.app') || window.location.hostname.endsWith('firebaseapp.com'))
  );
}

function isLocalApiBaseUrl(value: string): boolean {
  const normalizedValue = normalizeApiBaseUrl(value);
  return normalizedValue.startsWith('http://127.0.0.1') || normalizedValue.startsWith('http://localhost');
}

function getInitialApiBaseUrl(): string {
  const storedApiBaseUrl = localStorage.getItem(API_BASE_STORAGE_KEY);

  if (storedApiBaseUrl && isHostedConsole() && isLocalApiBaseUrl(storedApiBaseUrl)) {
    localStorage.setItem(API_BASE_STORAGE_KEY, DEPLOYED_API_BASE_URL);
    return DEPLOYED_API_BASE_URL;
  }

  return normalizeApiBaseUrl(storedApiBaseUrl || defaultApiBaseUrl);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : 'n/a';
  }
  if (typeof value === 'object') {
    return formatJson(value);
  }
  return String(value);
}

function formatQuantityWithUnit(quantity: unknown, unit: unknown): string | null {
  if (quantity === null || quantity === undefined || quantity === '') {
    return null;
  }
  const unitText = unit === null || unit === undefined || unit === '' ? '' : ` ${String(unit)}`;
  return `${String(quantity)}${unitText}`;
}

function formatPriceAmount(value: unknown, currency: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }
  const currencyText = currency === null || currency === undefined || currency === ''
    ? ''
    : ` ${String(currency)}`;
  return `${String(value)}${currencyText}`;
}

function parsePriceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsedValue = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }
  return null;
}

function arePriceValuesEffectivelySame(values: unknown[]): boolean {
  const parsedValues = values.map((value) => parsePriceNumber(value));
  if (parsedValues.some((value) => value === null)) {
    return false;
  }
  const [firstValue, ...remainingValues] = parsedValues as number[];
  return remainingValues.every((value) => Math.abs(value - firstValue) <= 0.0001);
}

function formatSearchPriceSummary(summary: Record<string, unknown>): string {
  if (!Object.keys(summary).length) {
    return 'No current price summary';
  }
  const currency = summary.currency;
  const offerCount = summary.offer_count ?? 0;
  const cheapestRetailer = summary.cheapest_chain || summary.cheapest_retailer || 'n/a';
  return [
    `cheapest ${formatPriceAmount(summary.min_current_price ?? summary.cheapest_price, currency)}`,
    `highest ${formatPriceAmount(summary.max_current_price, currency)}`,
    `avg ${formatPriceAmount(summary.avg_current_price, currency)}`,
    `${String(offerCount)} offers`,
    `retailer ${String(cheapestRetailer)}`,
  ].join(' | ');
}

function getProductSearchResults(body: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(body.results)) {
    return [];
  }
  return body.results.map((item) => asRecord(item));
}

function extractSourceMappings(body: unknown): Array<Record<string, unknown>> {
  const root = asRecord(body);
  const provenance = asRecord(root.provenance);
  const mappings = provenance.canonical_mappings;
  if (Array.isArray(mappings)) {
    return mappings
      .map((mapping) => asRecord(mapping))
      .filter((mapping) => typeof mapping.source_product_id === 'string' && mapping.source_product_id);
  }

  const sourceProductIds = provenance.source_product_ids;
  if (Array.isArray(sourceProductIds)) {
    return sourceProductIds
      .filter((value) => typeof value === 'string' && value)
      .map((sourceProductId) => ({ source_product_id: sourceProductId }));
  }

  return [];
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
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

function HomeSummaryPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);

  function submit(event: FormEvent) {
    event.preventDefault();
    runRequest({ method: 'GET', path: '/home/summary' });
  }

  return (
    <ToolPage
      title="Home Summary"
      description="Calls GET /home/summary and shows the current backend summary envelope."
    >
      <form className="tool-form" onSubmit={submit}>
        <RequestButton isLoading={isLoading}>Fetch Summary</RequestButton>
      </form>
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function ProductSearchPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [query, setQuery] = useState('\u043c\u043b\u044f\u043a\u043e');
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
      <ProductSearchResults result={result} />
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function ProductSearchResults({ result }: { result: ApiResult | null }) {
  if (!result?.ok) {
    return null;
  }

  try {
    const body = asRecord(result.body);
    const results = getProductSearchResults(body);
    const displayedResults = results.slice(0, 12);
    const total = typeof body.total === 'number' ? body.total : displayedResults.length;

    return (
      <section className="detail-summary" aria-label="Product search results">
        <div className="mapping-header">
          <h3>Product Results</h3>
          <span>{formatFieldValue(total)} total</span>
          <span>{displayedResults.length} shown</span>
          <span>{formatFieldValue(result.elapsedMs)} ms</span>
        </div>
        {displayedResults.length ? (
          <div className="product-result-list">
            {displayedResults.map((item, index) => (
              <ProductSearchResultRow
                item={item}
                key={String(item.canonical_product_id || `product-result-${index}`)}
              />
            ))}
          </div>
        ) : (
          <div className="response-empty compact">No product results in response.results.</div>
        )}
      </section>
    );
  } catch (error) {
    return (
      <div className="form-error">
        Product Search rendering failed: {error instanceof Error ? error.message : 'Unknown render error.'}
      </div>
    );
  }
}

function ProductSearchResultRow({ item }: { item: Record<string, unknown> }) {
  const debug = asRecord(item.search_debug);
  const matched = asRecord(debug.matched_enrichment);
  const currentOfferSummary = asRecord(item.current_offer_summary);
  const markers = asRecord(item.markers);
  const sizeMarker = asRecord(markers.size_marker);
  const productName = item.canonical_name || item.source_example_name || item.canonical_product_id;
  const price = currentOfferSummary.min_current_price ?? currentOfferSummary.cheapest_price;
  const highestPrice = currentOfferSummary.max_current_price;
  const averagePrice = currentOfferSummary.avg_current_price;
  const currency = currentOfferSummary.currency;
  const pricesAreSame = arePriceValuesEffectivelySame([price, highestPrice, averagePrice]);
  const lowPriceClassName = pricesAreSame ? 'price-chip price-chip--low price-chip--same' : 'price-chip price-chip--low';
  const highPriceClassName = pricesAreSame ? 'price-chip price-chip--high price-chip--same' : 'price-chip price-chip--high';
  const averagePriceClassName = pricesAreSame
    ? 'price-chip price-chip--average price-chip--same'
    : 'price-chip price-chip--average';

  return (
    <article className="product-result-row">
      <div className="product-result-main">
        <strong>{formatFieldValue(productName)}</strong>
        <code>{formatFieldValue(item.canonical_product_id)}</code>
        <small>
          {formatFieldValue(item.canonical_brand || item.canonical_product_type || matched.product_type)}
          {' | '}
          size: {formatFieldValue(sizeMarker.normalized_display || sizeMarker.display || markers.volume_marker)}
        </small>
      </div>
      <div className="product-price-grid">
        <SummaryField label="Cheapest" value={formatPriceAmount(price, currency)} className={lowPriceClassName} />
        <SummaryField label="Highest" value={formatPriceAmount(highestPrice, currency)} className={highPriceClassName} />
        <SummaryField label="Average" value={formatPriceAmount(averagePrice, currency)} className={averagePriceClassName} />
        <SummaryField label="Offers" value={currentOfferSummary.offer_count} />
      </div>
      <div className="product-result-meta">
        <span>{formatSearchPriceSummary(currentOfferSummary)}</span>
        <small>
          {formatFieldValue(matched.category)} / {formatFieldValue(matched.product_type)}
          {' | '}
          aliases: {formatFieldValue(matched.aliases)}
          {' | '}
          demotion: {formatFieldValue(debug.demotion_reason)}
        </small>
      </div>
    </article>
  );
}

function ProductDetailPage({
  apiBaseUrl,
  onViewPriceHistory,
}: {
  apiBaseUrl: string;
  onViewPriceHistory: (sourceProductId: string) => void;
}) {
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
      <ProductDetailSummary result={result} onViewPriceHistory={onViewPriceHistory} />
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function ProductDetailSummary({
  result,
  onViewPriceHistory,
}: {
  result: ApiResult | null;
  onViewPriceHistory: (sourceProductId: string) => void;
}) {
  if (!result?.ok) {
    return null;
  }

  const body = asRecord(result.body);
  const enrichment = asRecord(body.enrichment);
  const markers = asRecord(body.markers);
  const sizeMarker = asRecord(markers.size_marker);
  const provenance = asRecord(body.provenance);
  const mappings = extractSourceMappings(body);
  const offers = Array.isArray(body.current_offers)
    ? body.current_offers.map((offer) => asRecord(offer))
    : [];
  const offerSummary = asRecord(body.current_offer_summary);
  const brand = body.canonical_brand || enrichment.brand;
  const category = body.canonical_product_type || body.canonical_category_code || enrichment.category_l3 || enrichment.category_l2;

  return (
    <section className="detail-summary" aria-label="Product detail summary">
      <div className="summary-grid">
        <SummaryField label="canonical_product_id" value={body.canonical_product_id} />
        <SummaryField label="Product name" value={body.canonical_name || body.source_example_name} />
        <SummaryField label="Brand" value={brand} />
        <SummaryField label="Category" value={category} />
        <SummaryField label="volume_marker" value={markers.volume_marker} />
        <SummaryField label="count_marker" value={markers.count_marker} />
        <SummaryField label="age_band_marker" value={markers.age_band_marker} />
        <SummaryField label="reserve_marker" value={markers.reserve_marker} />
        <SummaryField label="size_marker" value={sizeMarker.normalized_display || sizeMarker.display} />
        <SummaryField label="size_total" value={formatQuantityWithUnit(sizeMarker.total_quantity, sizeMarker.total_unit)} />
        <SummaryField label="pack_count" value={sizeMarker.pack_count} />
        <SummaryField label="unit_quantity" value={formatQuantityWithUnit(sizeMarker.unit_quantity, sizeMarker.unit_quantity_unit)} />
      </div>

      <div className="mapping-header">
        <h3>Current offers</h3>
        <span>{formatFieldValue(offerSummary.offer_count || offers.length)} offers</span>
        {offerSummary.cheapest_chain ? <span>cheapest: {formatFieldValue(offerSummary.cheapest_chain)}</span> : null}
      </div>
      {offers.length ? (
        <div className="offer-list">
          {offers.map((offer) => {
            const sourceProductId = String(offer.source_product_id || '');
            return (
              <div className="offer-row" key={String(offer.offer_id || sourceProductId)}>
                <div>
                  <strong>{formatFieldValue(offer.current_price)} {formatFieldValue(offer.currency)}</strong>
                  <span>{formatFieldValue(offer.chain_name || offer.retailer)}</span>
                  <small>{formatFieldValue(offer.snapshot_date)} · {sourceProductId}</small>
                </div>
                <div className="mapping-actions">
                  <button className="button button-icon" type="button" title="Copy source_product_id" onClick={() => copyText(sourceProductId)} disabled={!sourceProductId}>
                    <Copy size={16} />
                  </button>
                  <button className="button" type="button" onClick={() => onViewPriceHistory(sourceProductId)} disabled={!sourceProductId}>
                    <History size={16} />
                    View Price History
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="response-empty compact">No current offers returned for this product.</div>
      )}

      <div className="mapping-header">
        <h3>Source product mappings</h3>
        <span>{formatFieldValue(provenance.canonical_mappings_count)} total</span>
        {provenance.source_product_ids_truncated ? <span>showing first {mappings.length}</span> : null}
      </div>
      {mappings.length ? (
        <div className="mapping-list">
          {mappings.map((mapping) => {
            const sourceProductId = String(mapping.source_product_id);
            return (
              <div className="mapping-row" key={sourceProductId}>
                <code>{sourceProductId}</code>
                <div className="mapping-actions">
                  <button className="button button-icon" type="button" title="Copy source_product_id" onClick={() => copyText(sourceProductId)}>
                    <Copy size={16} />
                  </button>
                  <button className="button" type="button" onClick={() => onViewPriceHistory(sourceProductId)}>
                    <History size={16} />
                    View Price History
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="response-empty compact">No source_product_id mappings returned for this product.</div>
      )}
    </section>
  );
}

function PriceLookupPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [idsText, setIdsText] = useState('');
  const [maxAgeDays, setMaxAgeDays] = useState('30');

  function submit(event: FormEvent) {
    event.preventDefault();
    const canonicalProductIds = idsText
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    runRequest({
      method: 'POST',
      path: '/prices/lookup',
      body: {
        canonical_product_ids: canonicalProductIds,
        options: {
          max_age_days: Number(maxAgeDays) || 30,
        },
      },
    });
  }

  return (
    <ToolPage
      title="Price Lookup"
      description="Calls POST /prices/lookup for canonical product ids."
    >
      <form className="tool-form two-columns" onSubmit={submit}>
        <Field label="Canonical product ids">
          <textarea value={idsText} onChange={(event) => setIdsText(event.target.value)} rows={6} required />
        </Field>
        <div className="stack">
          <Field label="Max age days">
            <input type="number" min="1" value={maxAgeDays} onChange={(event) => setMaxAgeDays(event.target.value)} />
          </Field>
          <div className="form-actions">
            <RequestButton isLoading={isLoading}>Lookup Prices</RequestButton>
          </div>
        </div>
      </form>
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function ShoppingIntentPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [query, setQuery] = useState('yogurt');
  const [ownerId, setOwnerId] = useState('');
  const [existingPreferenceJson, setExistingPreferenceJson] = useState('');
  const [selectedAttributesJson, setSelectedAttributesJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const examples = ['yogurt', 'cheese', 'сирене', 'juice', 'bread', 'coffee'];

  function runIntentRequest(nextQuery = query) {
    setJsonError(null);
    try {
      const existingPreference = parseJsonInput(existingPreferenceJson);
      const selectedAttributes = parseJsonInput(selectedAttributesJson);
      runRequest({
        method: 'POST',
        path: '/shopping-intent/resolve',
        body: {
          query: nextQuery,
          ...(ownerId.trim() ? { owner_id: ownerId.trim(), owner_type: 'user' } : {}),
          ...(existingPreference === undefined ? {} : { existing_preference: existingPreference }),
          ...(selectedAttributes === undefined ? {} : { selected_attributes: selectedAttributes }),
        },
      });
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON body.');
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    runIntentRequest();
  }

  return (
    <ToolPage
      title="Shopping Intent"
      description="Calls POST /shopping-intent/resolve for product-family intent and preference defaults."
    >
      <form className="tool-form two-columns" onSubmit={submit}>
        <div className="stack">
          <Field label="Query / item text">
            <input value={query} onChange={(event) => setQuery(event.target.value)} required />
          </Field>
          <div className="example-row" aria-label="Example requests">
            {examples.map((example) => (
              <button
                className="button"
                key={example}
                type="button"
                onClick={() => {
                  setQuery(example);
                  runIntentRequest(example);
                }}
                disabled={isLoading}
                title={`Resolve ${example}`}
              >
                {example}
              </button>
            ))}
          </div>
          <Field label="Owner / user id">
            <input value={ownerId} onChange={(event) => setOwnerId(event.target.value)} placeholder="optional" />
          </Field>
        </div>
        <div className="stack">
          <Field label="Existing preference JSON">
            <textarea value={existingPreferenceJson} onChange={(event) => setExistingPreferenceJson(event.target.value)} rows={6} placeholder="{ }" />
          </Field>
          <Field label="Selected answers JSON">
            <textarea value={selectedAttributesJson} onChange={(event) => setSelectedAttributesJson(event.target.value)} rows={5} placeholder="{ }" />
          </Field>
          {jsonError ? <div className="form-error">{jsonError}</div> : null}
          <div className="form-actions">
            <RequestButton isLoading={isLoading}>Resolve Intent</RequestButton>
          </div>
        </div>
      </form>
      <ShoppingIntentSummary result={result} />
      <ResponsePanel result={result} />
    </ToolPage>
  );
}

function ShoppingIntentSummary({ result }: { result: ApiResult | null }) {
  if (!result?.ok) {
    return null;
  }

  const body = asRecord(result.body);
  const selectedFamily = asRecord(body.selected_family);
  const possibleFamilies = Array.isArray(body.possible_families)
    ? body.possible_families.map((entry) => asRecord(entry))
    : [];
  const questions = Array.isArray(body.clarification_questions)
    ? body.clarification_questions.map((entry) => asRecord(entry))
    : [];
  const firstQuestion = questions[0] || {};
  const options = Array.isArray(firstQuestion.options)
    ? firstQuestion.options.map((entry) => asRecord(entry))
    : [];

  return (
    <section className="detail-summary" aria-label="Shopping intent summary">
      <div className="summary-grid">
        <SummaryField label="Status" value={body.status} />
        <SummaryField label="Ready" value={body.status === 'ready_for_product_selection'} />
        <SummaryField label="Resolved family" value={selectedFamily.family_id || possibleFamilies.map((family) => family.family_id).join(', ')} />
        <SummaryField label="Ambiguity" value={body.status === 'family_ambiguous' ? 'family_ambiguous' : 'none'} />
        <SummaryField label="Clarification" value={firstQuestion.prompt_en || firstQuestion.attribute_id} />
        <SummaryField label="Suggested defaults" value={body.suggested_defaults} />
        <SummaryField label="Resolved attributes" value={body.resolved_attributes} />
        <SummaryField label="Preference record" value={body.preference_record || body.preference} />
      </div>
      <div className="mapping-header">
        <h3>Options</h3>
        <span>{options.length} options</span>
      </div>
      {options.length ? (
        <div className="option-list">
          {options.map((option) => (
            <div className="option-row" key={String(option.value_id || option.family_id)}>
              <strong>{formatFieldValue(option.value_id || option.family_id)}</strong>
              <span>{formatFieldValue(option.display_name_en)}</span>
              <small>{formatFieldValue(option.display_name_bg)}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="response-empty compact">No clarification options returned.</div>
      )}
    </section>
  );
}

function SummaryField({ label, value, className = '' }: { label: string; value: unknown; className?: string }) {
  return (
    <div className={['summary-field', className].filter(Boolean).join(' ')}>
      <span>{label}</span>
      <strong>{formatFieldValue(value)}</strong>
    </div>
  );
}

function PriceHistoryPage({
  apiBaseUrl,
  sourceProductId,
  setSourceProductId,
  autoRunRequestId,
}: {
  apiBaseUrl: string;
  sourceProductId: string;
  setSourceProductId: (value: string) => void;
  autoRunRequestId: number;
}) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);

  function runHistoryRequest(nextSourceProductId = sourceProductId) {
    const query = new URLSearchParams({
      source_product_id: nextSourceProductId.trim(),
    });
    runRequest({ method: 'GET', path: `/product-history?${query.toString()}` });
  }

  useEffect(() => {
    if (sourceProductId.trim()) {
      runHistoryRequest(sourceProductId);
    }
  }, [autoRunRequestId]);

  function submit(event: FormEvent) {
    event.preventDefault();
    runHistoryRequest();
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

function IngestJobsPage({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { result, isLoading, runRequest } = useApiRunner(apiBaseUrl);
  const [snapshotDate, setSnapshotDate] = useState('2026-04-21');
  const [zipUrl, setZipUrl] = useState('https://kolkostruva.bg/opendata_files/2026-04-21.zip');
  const [localPath, setLocalPath] = useState('C:\\dev\\Pricer\\data_samples\\phase6_snapshot_2026-04-21.zip');
  const [targetCollections, setTargetCollections] = useState('raw_price_snapshots,product_daily_prices,ingest_runs,pipeline_logs');
  const [dryRun, setDryRun] = useState(true);
  const [firestorePrefix, setFirestorePrefix] = useState('prod');

  const targetCollectionList = targetCollections
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const commandPreview = [
    `$env:PRICER_SNAPSHOT_DATE="${snapshotDate.trim()}"`,
    zipUrl.trim() ? `$env:PRICER_SNAPSHOT_URL="${zipUrl.trim()}"` : null,
    localPath.trim() ? `$env:PRICER_SNAPSHOT_ZIP_PATH="${localPath.trim()}"` : null,
    '$env:PRICER_STORE_BACKEND="firestore"',
    '$env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"',
    '$env:PRICER_FIRESTORE_DATABASE_ID="(default)"',
    `$env:PRICER_FIRESTORE_COLLECTION_PREFIX="${firestorePrefix.trim() || 'prod'}"`,
    `$env:PRICER_PHASE6_PUBLISH_DRY_RUN="${dryRun ? 'true' : 'false'}"`,
    `$env:PRICER_PHASE6_PUBLISH_COLLECTIONS="${targetCollectionList.join(',')}"`,
    '$env:ENABLE_LLM_ENRICHMENT="false"',
    '$env:XAI_API_KEY=""',
    'npm run phase6:ingest-snapshot',
  ].filter(Boolean).join('; ');

  const incrementalDryRunCommand = [
    `$env:PRICER_SNAPSHOT_DATE="${snapshotDate.trim()}"`,
    zipUrl.trim() ? `$env:PRICER_SNAPSHOT_URL="${zipUrl.trim()}"` : null,
    localPath.trim() ? `$env:PRICER_SNAPSHOT_ZIP_PATH="${localPath.trim()}"` : null,
    '$env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"',
    '$env:PRICER_FIRESTORE_DATABASE_ID="(default)"',
    `$env:PRICER_FIRESTORE_COLLECTION_PREFIX="${firestorePrefix.trim() || 'prod'}"`,
    '$env:PRICER_INCREMENTAL_DRY_RUN="true"',
    '$env:PRICER_INCREMENTAL_PROGRESS_EVERY="10000"',
    'npm run phase6:diff-snapshot',
  ].filter(Boolean).join('; ');

  const baselineExportCommand = [
    '$env:PRICER_FIRESTORE_PROJECT_ID="pricer-ee440"',
    '$env:PRICER_FIRESTORE_DATABASE_ID="(default)"',
    `$env:PRICER_FIRESTORE_COLLECTION_PREFIX="${firestorePrefix.trim() || 'prod'}"`,
    '$env:PRICER_INCREMENTAL_BASELINE_OUTPUT_PATH="C:\\dev\\Pricer\\runtime_data\\prod_current_offer_fingerprints.jsonl"',
    '$env:PRICER_INCREMENTAL_PROGRESS_EVERY="10000"',
    'npm run phase6:export-current-offer-fingerprints',
  ].join('; ');

  const requestBody = {
    snapshot_date: snapshotDate.trim(),
    source_type: localPath.trim() ? 'local_path' : 'url',
    source_url: zipUrl.trim() || undefined,
    local_path: localPath.trim() || undefined,
    dry_run: dryRun,
    target_collections: targetCollectionList,
    firestore_prefix: firestorePrefix.trim() || 'prod',
  };

  function submitPlan(event: FormEvent) {
    event.preventDefault();
    runRequest({
      method: 'POST',
      path: '/internal/ingest/plan',
      body: requestBody,
    });
  }

  function createJob() {
    runRequest({
      method: 'POST',
      path: '/internal/ingest/jobs',
      body: requestBody,
    });
  }

  function fetchJobs() {
    runRequest({
      method: 'GET',
      path: '/internal/ingest/jobs?limit=25',
    });
  }

  return (
    <ToolPage
      title="Ingest / Data Jobs"
      description="Plans historical KolkoStruva snapshot ingest jobs and gives the operator a safe CLI command."
    >
      <section className="ingest-environment" aria-label="Ingest environment">
        <SummaryField label="API base" value={apiBaseUrl} />
        <SummaryField label="Firebase project" value="pricer-ee440" />
        <SummaryField label="Firestore database" value="(default)" />
        <SummaryField label="Collection prefix" value={firestorePrefix || 'prod'} />
      </section>

      <form className="tool-form two-columns" onSubmit={submitPlan}>
        <div className="stack">
          <Field label="Snapshot date">
            <input value={snapshotDate} onChange={(event) => setSnapshotDate(event.target.value)} placeholder="YYYY-MM-DD" />
          </Field>
          <Field label="ZIP URL">
            <input value={zipUrl} onChange={(event) => setZipUrl(event.target.value)} spellCheck={false} />
          </Field>
          <Field label="Local ZIP path">
            <input value={localPath} onChange={(event) => setLocalPath(event.target.value)} spellCheck={false} />
          </Field>
        </div>
        <div className="stack">
          <Field label="Target collections">
            <textarea value={targetCollections} onChange={(event) => setTargetCollections(event.target.value)} rows={5} />
          </Field>
          <Field label="Firestore prefix">
            <input value={firestorePrefix} onChange={(event) => setFirestorePrefix(event.target.value)} />
          </Field>
          <label className="check-field">
            <input type="checkbox" checked={dryRun} onChange={(event) => setDryRun(event.target.checked)} />
            Dry-run
          </label>
          <div className="form-actions wrap">
            <RequestButton isLoading={isLoading}>Plan</RequestButton>
            <button className="button" type="button" onClick={createJob} disabled={isLoading} title="Create planned job">
              <Save size={16} />
              Create Job
            </button>
            <button className="button" type="button" onClick={fetchJobs} disabled={isLoading} title="Fetch ingest jobs">
              <History size={16} />
              Jobs
            </button>
          </div>
        </div>
      </form>

      <section className="command-panel" aria-label="Operator command">
        <div className="mapping-header">
          <h3>Historical dry-run command</h3>
          <button className="button button-icon" type="button" title="Copy command" onClick={() => copyText(commandPreview)}>
            <Copy size={16} />
          </button>
        </div>
        <pre>{commandPreview}</pre>
      </section>

      <section className="command-panel" aria-label="Daily incremental dry-run command">
        <div className="mapping-header">
          <h3>Daily incremental dry-run command</h3>
          <button className="button button-icon" type="button" title="Copy incremental command" onClick={() => copyText(incrementalDryRunCommand)}>
            <Copy size={16} />
          </button>
        </div>
        <pre>{incrementalDryRunCommand}</pre>
      </section>

      <section className="command-panel" aria-label="Fingerprint baseline export command">
        <div className="mapping-header">
          <h3>Fingerprint baseline export command</h3>
          <button className="button button-icon" type="button" title="Copy baseline export command" onClick={() => copyText(baselineExportCommand)}>
            <Copy size={16} />
          </button>
        </div>
        <pre>{baselineExportCommand}</pre>
      </section>

      <section className="safety-list" aria-label="Ingest safety rules">
        <span>Dry-run first</span>
        <span>No destructive deletes</span>
        <span>Baseline export reads current offers and writes a local JSONL file</span>
        <span>History is separate from current prices</span>
        <span>Current update is separate from historical backfill</span>
        <span>Use a fingerprint baseline for full diff cost estimates</span>
        <span>Do not run publishers concurrently</span>
      </section>

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
  const [sourceProductId, setSourceProductId] = useState('');
  const [autoHistoryRequestId, setAutoHistoryRequestId] = useState(0);
  const [apiBaseUrl, setApiBaseUrl] = useState(getInitialApiBaseUrl);
  const [draftApiBaseUrl, setDraftApiBaseUrl] = useState(apiBaseUrl);

  const activePage = useMemo(() => {
    switch (activeTab) {
      case 'health':
        return <HealthPage apiBaseUrl={apiBaseUrl} />;
      case 'home-summary':
        return <HomeSummaryPage apiBaseUrl={apiBaseUrl} />;
      case 'product-search':
        return <ProductSearchPage apiBaseUrl={apiBaseUrl} />;
      case 'product-detail':
        return (
          <ProductDetailPage
            apiBaseUrl={apiBaseUrl}
            onViewPriceHistory={(nextSourceProductId) => {
              setSourceProductId(nextSourceProductId);
              setAutoHistoryRequestId((value) => value + 1);
              setActiveTab('price-history');
            }}
          />
        );
      case 'price-history':
        return (
          <PriceHistoryPage
            apiBaseUrl={apiBaseUrl}
            sourceProductId={sourceProductId}
            setSourceProductId={setSourceProductId}
            autoRunRequestId={autoHistoryRequestId}
          />
        );
      case 'price-lookup':
        return <PriceLookupPage apiBaseUrl={apiBaseUrl} />;
      case 'shopping-intent':
        return <ShoppingIntentPage apiBaseUrl={apiBaseUrl} />;
      case 'basket-test':
        return <BasketTestPage apiBaseUrl={apiBaseUrl} />;
      case 'ingest-jobs':
        return <IngestJobsPage apiBaseUrl={apiBaseUrl} />;
      case 'raw-api':
        return <RawApiPage apiBaseUrl={apiBaseUrl} />;
    }
  }, [activeTab, apiBaseUrl, sourceProductId, autoHistoryRequestId]);

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
