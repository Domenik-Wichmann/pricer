const INTERNAL_INSIGHTS_DASHBOARD_PATH = '/internal/insights/dashboard';
const INTERNAL_INSIGHTS_DASHBOARD_ENDPOINTS = Object.freeze([
  '/analytics/insights/overview',
  '/analytics/insights/opportunities',
  '/analytics/insights/categories',
  '/analytics/insights/localities',
  '/analytics/insights/chains',
]);

function buildInternalInsightsDashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pricer Internal Insights</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #18202a;
      --muted: #5d6875;
      --line: #d8dee6;
      --accent: #1f6feb;
      --danger: #b42318;
      --ok: #1f7a4d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
    }
    header, main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      padding-top: 28px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 18px;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: var(--muted);
    }
    .toolbar, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 2px rgba(20, 28, 36, 0.05);
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1.4fr) repeat(6, minmax(120px, 1fr)) auto;
      gap: 10px;
      align-items: end;
      margin-bottom: 16px;
    }
    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    input, select, button {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 10px;
      font: inherit;
      background: #fff;
      color: var(--text);
    }
    button {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      font-weight: 700;
      white-space: nowrap;
    }
    button.secondary {
      background: #fff;
      color: var(--accent);
    }
    .status {
      min-height: 22px;
      margin-bottom: 16px;
      color: var(--muted);
      font-size: 14px;
    }
    .status.error { color: var(--danger); }
    .status.ok { color: var(--ok); }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .card .label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .card .value {
      margin-top: 6px;
      font-size: 24px;
      font-weight: 800;
    }
    .stack {
      display: grid;
      gap: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-top: 1px solid var(--line);
      padding: 9px 8px;
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 3px 8px;
      background: #eef4ff;
      color: #174ea6;
      font-size: 12px;
      font-weight: 700;
    }
    .empty {
      color: var(--muted);
      padding: 10px 0;
    }
    @media (max-width: 940px) {
      .toolbar { grid-template-columns: 1fr 1fr; }
      .grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 620px) {
      header, main { padding: 14px; }
      .toolbar, .grid { grid-template-columns: 1fr; }
      table { font-size: 13px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Pricer Internal Insights</h1>
    <p>Internal market intelligence dashboard stub. Token stays in this browser and is sent only as an API header.</p>
  </header>
  <main>
    <section class="toolbar" aria-label="Insight controls">
      <label>Admin token
        <input id="token" type="password" autocomplete="off" placeholder="x-pricer-admin-token">
      </label>
      <label>Role
        <select id="role">
          <option value="admin">admin</option>
          <option value="analyst">analyst</option>
        </select>
      </label>
      <label>Window
        <select id="window">
          <option value="last_30d">last_30d</option>
          <option value="last_7d">last_7d</option>
          <option value="all">all</option>
        </select>
      </label>
      <label>Limit
        <input id="limit" type="number" min="1" max="100" value="20">
      </label>
      <label>Locality
        <input id="locality" type="text" placeholder="burgas">
      </label>
      <label>Category
        <input id="category" type="text" placeholder="Beverages">
      </label>
      <label>Chain
        <input id="chain" type="text" placeholder="kaufland">
      </label>
      <button id="refresh" type="button">Refresh</button>
      <button id="clear" class="secondary" type="button">Clear token</button>
    </section>
    <div id="status" class="status">Enter the internal analytics token and refresh.</div>
    <section id="overview" class="grid" aria-label="Overview cards"></section>
    <section class="stack">
      <div class="panel">
        <h2>Top Opportunities</h2>
        <div id="opportunities"></div>
      </div>
      <div class="panel">
        <h2>Categories</h2>
        <div id="categories"></div>
      </div>
      <div class="panel">
        <h2>Localities</h2>
        <div id="localities"></div>
      </div>
      <div class="panel">
        <h2>Chains</h2>
        <div id="chains"></div>
      </div>
    </section>
  </main>
  <script>
    const endpoints = ${JSON.stringify(INTERNAL_INSIGHTS_DASHBOARD_ENDPOINTS)};
    const fields = ['token', 'role', 'window', 'limit', 'locality', 'category', 'chain'];
    const nodes = Object.fromEntries(fields.map((id) => [id, document.getElementById(id)]));
    const statusNode = document.getElementById('status');

    function restore() {
      nodes.token.value = localStorage.getItem('pricer.internalAnalyticsToken') || '';
      nodes.role.value = localStorage.getItem('pricer.internalAnalyticsRole') || 'admin';
    }

    function persist() {
      localStorage.setItem('pricer.internalAnalyticsToken', nodes.token.value.trim());
      localStorage.setItem('pricer.internalAnalyticsRole', nodes.role.value);
    }

    function queryString() {
      const params = new URLSearchParams();
      params.set('window', nodes.window.value);
      params.set('limit', nodes.limit.value || '20');
      if (nodes.locality.value.trim()) params.set('locality_code', nodes.locality.value.trim());
      if (nodes.category.value.trim()) params.set('category_l2', nodes.category.value.trim());
      if (nodes.chain.value.trim()) params.set('chain_id', nodes.chain.value.trim());
      return params.toString();
    }

    async function loadEndpoint(path) {
      const response = await fetch(path + '?' + queryString(), {
        headers: {
          'x-pricer-admin-token': nodes.token.value.trim(),
          'x-pricer-role': nodes.role.value,
        },
      });
      const body = await response.json().catch(() => ({ error: 'invalid response' }));
      if (!response.ok) {
        throw new Error(body && body.error ? body.error : 'request failed');
      }
      return body;
    }

    async function refresh() {
      persist();
      setStatus('Loading insights...', '');
      try {
        const [overview, opportunities, categories, localities, chains] = await Promise.all(
          endpoints.map(loadEndpoint)
        );
        renderOverview(overview);
        renderOpportunities(opportunities.opportunities || []);
        renderCategories(categories.categories || []);
        renderLocalities(localities.localities || []);
        renderChains(chains.chains || []);
        setStatus('Loaded ' + new Date().toLocaleString(), 'ok');
      } catch (error) {
        setStatus('Unable to load insights: ' + error.message, 'error');
      }
    }

    function setStatus(text, kind) {
      statusNode.textContent = text;
      statusNode.className = 'status' + (kind ? ' ' + kind : '');
    }

    function renderOverview(data) {
      const totals = data.totals || {};
      document.getElementById('overview').innerHTML = [
        card('Signals', totals.total_signals ?? 0),
        card('Opportunities', totals.total_opportunities ?? 0),
        card('High Confidence', totals.high_confidence_opportunities ?? 0),
        card('Top Category', data.top_category ? data.top_category.category_l2 : 'None'),
      ].join('');
    }

    function renderOpportunities(items) {
      renderTable('opportunities', items, [
        ['Title', (row) => row.title],
        ['Type', (row) => badge(row.opportunity_type)],
        ['Confidence', (row) => row.confidence],
        ['Score', (row) => row.gap_score],
        ['Locality', (row) => row.locality_code || ''],
        ['Category', (row) => row.category_l2 || ''],
        ['Action', (row) => row.recommended_action || ''],
      ]);
    }

    function renderCategories(items) {
      renderTable('categories', items, [
        ['Category', (row) => row.category_l2 || 'Uncategorized'],
        ['Opportunities', (row) => row.opportunity_count],
        ['Avg Score', (row) => row.avg_gap_score],
        ['Top Gap', (row) => row.top_gap || ''],
      ]);
    }

    function renderLocalities(items) {
      renderTable('localities', items, [
        ['Locality', (row) => row.locality_code || 'unknown'],
        ['Opportunities', (row) => row.opportunity_count],
        ['Avg Score', (row) => row.avg_gap_score],
        ['Top Gap', (row) => row.top_gap || ''],
      ]);
    }

    function renderChains(items) {
      renderTable('chains', items, [
        ['Chain', (row) => row.chain_name || row.chain_id || 'unknown'],
        ['Coverage', (row) => formatPercent(row.coverage_rate)],
        ['Gaps', (row) => row.gap_count],
        ['Top Gap', (row) => row.top_gap || ''],
      ]);
    }

    function card(label, value) {
      return '<div class="card"><div class="label">' + escapeHtml(label) + '</div><div class="value">' + escapeHtml(String(value)) + '</div></div>';
    }

    function renderTable(targetId, items, columns) {
      const target = document.getElementById(targetId);
      if (!items.length) {
        target.innerHTML = '<div class="empty">No rows.</div>';
        return;
      }
      const head = '<thead><tr>' + columns.map(([label]) => '<th>' + escapeHtml(label) + '</th>').join('') + '</tr></thead>';
      const body = '<tbody>' + items.map((row) => '<tr>' + columns.map(([, read]) => '<td>' + read(row) + '</td>').join('') + '</tr>').join('') + '</tbody>';
      target.innerHTML = '<table>' + head + body + '</table>';
    }

    function badge(value) {
      return '<span class="badge">' + escapeHtml(String(value || '')) + '</span>';
    }

    function formatPercent(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.round(parsed * 100) + '%' : '';
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char]));
    }

    document.getElementById('refresh').addEventListener('click', refresh);
    document.getElementById('clear').addEventListener('click', () => {
      localStorage.removeItem('pricer.internalAnalyticsToken');
      nodes.token.value = '';
      setStatus('Token cleared.', '');
    });
    restore();
  </script>
</body>
</html>`;
}

function handleInternalInsightsDashboardRequest() {
  return {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: buildInternalInsightsDashboardHtml(),
  };
}

module.exports = {
  INTERNAL_INSIGHTS_DASHBOARD_ENDPOINTS,
  INTERNAL_INSIGHTS_DASHBOARD_PATH,
  buildInternalInsightsDashboardHtml,
  handleInternalInsightsDashboardRequest,
};
