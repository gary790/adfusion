// ============================================
// AD FUSION — Frontend Application
// Single-page app with full dashboard, campaigns, AI, automation
// ============================================

// ---- State ----
const state = {
  token: localStorage.getItem('af_token'),
  user: null,
  workspaces: [],
  currentWorkspace: localStorage.getItem('af_workspace'),
  currentPage: 'dashboard',
  dateRange: 30,
  charts: {},
};

// ---- API Client ----
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  if (state.token) cfg.headers.Authorization = `Bearer ${state.token}`;
  if (state.currentWorkspace) cfg.headers['X-Workspace-ID'] = state.currentWorkspace;
  return cfg;
});
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) { state.token = null; localStorage.removeItem('af_token'); showAuth(); }
  return Promise.reject(err);
});

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  if (state.token) { loadProfile(); }
  else { showAuth(); }
});

async function loadProfile() {
  try {
    const { data } = await api.get('/auth/me');
    state.user = data.data.user;
    state.workspaces = data.data.workspaces || [];
    if (!state.currentWorkspace && state.workspaces.length > 0) {
      state.currentWorkspace = state.workspaces[0].id;
      localStorage.setItem('af_workspace', state.currentWorkspace);
    }
    document.getElementById('user-name').textContent = state.user.name || state.user.email;
    const ws = state.workspaces.find(w => w.id === state.currentWorkspace);
    document.getElementById('user-plan').textContent = ws ? `${ws.plan.charAt(0).toUpperCase() + ws.plan.slice(1)} Plan` : 'Free Plan';
    navigate('dashboard');
  } catch {
    showAuth();
  }
}

// ---- Navigation ----
function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
    if (el.dataset.page !== page) el.classList.add('text-gray-600');
    else el.classList.remove('text-gray-600');
  });
  const titles = { dashboard:'Dashboard', campaigns:'Campaigns', ads:'Ads Manager', ai:'AI Engine', automation:'Automation', copy:'Copy Generator', accounts:'Ad Accounts', billing:'Billing', settings:'Settings' };
  document.getElementById('page-title').textContent = titles[page] || page;

  const pages = { dashboard: renderDashboard, campaigns: renderCampaigns, ads: renderAdsManager, ai: renderAI, automation: renderAutomation, copy: renderCopyGenerator, accounts: renderAccounts, billing: renderBilling, settings: renderSettings };
  const renderer = pages[page];
  if (renderer) renderer();
}

function handleDateChange() {
  state.dateRange = parseInt(document.getElementById('date-range').value);
  if (state.currentPage === 'dashboard') renderDashboard();
}

// ---- Auth Page ----
function showAuth() {
  document.getElementById('sidebar').style.display = 'none';
  document.querySelector('main').classList.remove('ml-64');
  document.getElementById('page-content').innerHTML = `
    <div class="min-h-screen flex items-center justify-center -m-6 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900">
      <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md fade-in">
        <div class="text-center mb-8">
          <div class="w-14 h-14 rounded-2xl btn-primary flex items-center justify-center mx-auto mb-4"><i class="fas fa-bolt text-white text-xl"></i></div>
          <h2 class="text-2xl font-bold text-gray-900">Ad Fusion</h2>
          <p class="text-gray-500 text-sm mt-1">World-class Meta Ad Optimization Platform</p>
        </div>
        <div id="auth-tabs" class="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button onclick="showLoginTab()" id="login-tab-btn" class="flex-1 py-2 text-sm font-medium rounded-md bg-white shadow text-brand-600 transition">Sign In</button>
          <button onclick="showSignupTab()" id="signup-tab-btn" class="flex-1 py-2 text-sm font-medium rounded-md text-gray-500 transition">Sign Up</button>
        </div>
        <div id="auth-form">
          <form onsubmit="handleLogin(event)" class="space-y-4">
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" id="login-email" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none text-sm" placeholder="you@company.com" required></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Password</label><input type="password" id="login-password" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none text-sm" placeholder="Min 8 characters" required></div>
            <div id="login-error" class="hidden text-sm text-danger"></div>
            <button type="submit" class="w-full py-2.5 btn-primary text-white rounded-lg font-medium text-sm hover:opacity-90 transition">Sign In</button>
          </form>
        </div>
      </div>
    </div>`;
}

function showLoginTab() {
  document.getElementById('login-tab-btn').className = 'flex-1 py-2 text-sm font-medium rounded-md bg-white shadow text-brand-600 transition';
  document.getElementById('signup-tab-btn').className = 'flex-1 py-2 text-sm font-medium rounded-md text-gray-500 transition';
  document.getElementById('auth-form').innerHTML = `
    <form onsubmit="handleLogin(event)" class="space-y-4">
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" id="login-email" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none text-sm" required></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Password</label><input type="password" id="login-password" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none text-sm" required></div>
      <div id="login-error" class="hidden text-sm text-danger"></div>
      <button type="submit" class="w-full py-2.5 btn-primary text-white rounded-lg font-medium text-sm">Sign In</button>
    </form>`;
}

function showSignupTab() {
  document.getElementById('signup-tab-btn').className = 'flex-1 py-2 text-sm font-medium rounded-md bg-white shadow text-brand-600 transition';
  document.getElementById('login-tab-btn').className = 'flex-1 py-2 text-sm font-medium rounded-md text-gray-500 transition';
  document.getElementById('auth-form').innerHTML = `
    <form onsubmit="handleSignup(event)" class="space-y-4">
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label><input type="text" id="signup-name" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none text-sm" required></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" id="signup-email" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none text-sm" required></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Password</label><input type="password" id="signup-password" minlength="8" class="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none text-sm" required></div>
      <div id="signup-error" class="hidden text-sm text-danger"></div>
      <button type="submit" class="w-full py-2.5 btn-primary text-white rounded-lg font-medium text-sm">Create Account</button>
    </form>`;
}

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const { data } = await api.post('/auth/login', { email: document.getElementById('login-email').value, password: document.getElementById('login-password').value });
    state.token = data.data.accessToken;
    localStorage.setItem('af_token', state.token);
    document.getElementById('sidebar').style.display = 'flex';
    document.querySelector('main').classList.add('ml-64');
    loadProfile();
  } catch (err) {
    errEl.textContent = err.response?.data?.error?.message || 'Login failed';
    errEl.classList.remove('hidden');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const errEl = document.getElementById('signup-error');
  errEl.classList.add('hidden');
  try {
    const { data } = await api.post('/auth/signup', { name: document.getElementById('signup-name').value, email: document.getElementById('signup-email').value, password: document.getElementById('signup-password').value });
    state.token = data.data.accessToken;
    localStorage.setItem('af_token', state.token);
    document.getElementById('sidebar').style.display = 'flex';
    document.querySelector('main').classList.add('ml-64');
    loadProfile();
  } catch (err) {
    errEl.textContent = err.response?.data?.error?.message || 'Signup failed';
    errEl.classList.remove('hidden');
  }
}

// ---- DASHBOARD ----
async function renderDashboard() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const days = state.dateRange;
    const df = new Date(Date.now() - days * 864e5).toISOString().split('T')[0];
    const dt = new Date().toISOString().split('T')[0];
    const [summaryRes, trendRes, topCampRes, topAdRes] = await Promise.all([
      api.get(`/dashboard/summary?date_from=${df}&date_to=${dt}`).catch(() => null),
      api.get(`/dashboard/spend-trend?days=${days}`).catch(() => null),
      api.get(`/dashboard/top-campaigns?days=${days}&limit=5`).catch(() => null),
      api.get(`/dashboard/top-ads?days=${days}&limit=5`).catch(() => null),
    ]);

    const s = summaryRes?.data?.data?.metrics || {};
    const trend = trendRes?.data?.data || [];
    const topCamps = topCampRes?.data?.data || [];
    const topAds = topAdRes?.data?.data || [];

    el.innerHTML = `
      <div class="space-y-6 fade-in">
        <!-- Metric Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${metricCard('Spend', fmtCurrency(s.spend?.value), s.spend?.change, 'fas fa-dollar-sign', 'brand')}
          ${metricCard('Impressions', fmtNum(s.impressions?.value), s.impressions?.change, 'fas fa-eye', 'blue')}
          ${metricCard('Clicks', fmtNum(s.clicks?.value), s.clicks?.change, 'fas fa-mouse-pointer', 'emerald')}
          ${metricCard('CTR', fmtPct(s.ctr?.value), s.ctr?.change, 'fas fa-percentage', 'amber')}
          ${metricCard('CPC', fmtCurrency(s.cpc?.value), s.cpc?.change, 'fas fa-hand-holding-dollar', 'violet')}
          ${metricCard('CPM', fmtCurrency(s.cpm?.value), s.cpm?.change, 'fas fa-chart-bar', 'rose')}
          ${metricCard('Reach', fmtNum(s.reach?.value), null, 'fas fa-users', 'cyan')}
          ${metricCard('Frequency', (s.frequency?.value || 0).toFixed(2), null, 'fas fa-redo', 'orange')}
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-4"><i class="fas fa-chart-area text-brand-500 mr-2"></i>Spend Trend</h3>
            <canvas id="spend-chart" height="220"></canvas>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-4"><i class="fas fa-chart-line text-emerald-500 mr-2"></i>CTR & CPC Trend</h3>
            <canvas id="ctr-chart" height="220"></canvas>
          </div>
        </div>

        <!-- Tables Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Top Campaigns -->
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-trophy text-amber-500 mr-2"></i>Top Campaigns</h3>
              <button onclick="navigate('campaigns')" class="text-xs text-brand-600 hover:underline">View All</button>
            </div>
            <div class="space-y-3">
              ${topCamps.length ? topCamps.map(c => `
                <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition cursor-pointer">
                  <div class="w-2 h-2 rounded-full ${c.status === 'ACTIVE' ? 'bg-success' : 'bg-gray-300'}"></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">${esc(c.name)}</p>
                    <p class="text-xs text-gray-400">${c.objective || 'N/A'}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-semibold">${fmtCurrency(c.spend)}</p>
                    <p class="text-xs text-gray-400">CTR ${fmtPct(c.ctr)}</p>
                  </div>
                </div>
              `).join('') : '<p class="text-sm text-gray-400 text-center py-6">No campaigns yet. Connect a Meta ad account to get started.</p>'}
            </div>
          </div>

          <!-- Top Ads -->
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-star text-yellow-500 mr-2"></i>Top Performing Ads</h3>
              <button onclick="navigate('ads')" class="text-xs text-brand-600 hover:underline">View All</button>
            </div>
            <div class="space-y-3">
              ${topAds.length ? topAds.map(a => `
                <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <div class="w-2 h-2 rounded-full ${a.status === 'ACTIVE' ? 'bg-success' : 'bg-gray-300'}"></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">${esc(a.name)}</p>
                    <p class="text-xs text-gray-400">${esc(a.campaign_name || '')}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm font-semibold text-success">${fmtPct(a.ctr)} CTR</p>
                    <p class="text-xs text-gray-400">${fmtCurrency(a.spend)} spent</p>
                  </div>
                </div>
              `).join('') : '<p class="text-sm text-gray-400 text-center py-6">No ad data yet.</p>'}
            </div>
          </div>
        </div>
      </div>`;

    // Render Charts
    if (trend.length > 0) {
      renderSpendChart(trend);
      renderCtrChart(trend);
    }
  } catch (err) {
    el.innerHTML = emptyState('Dashboard', 'Connect your Meta ad account to see your performance data', 'fas fa-chart-line');
  }
}

function renderSpendChart(data) {
  const ctx = document.getElementById('spend-chart');
  if (!ctx) return;
  if (state.charts.spend) state.charts.spend.destroy();
  state.charts.spend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => fmtDate(d.date)),
      datasets: [{
        label: 'Spend ($)',
        data: data.map(d => Number(d.spend || 0)),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
      }]
    },
    options: chartOpts('$'),
  });
}

function renderCtrChart(data) {
  const ctx = document.getElementById('ctr-chart');
  if (!ctx) return;
  if (state.charts.ctr) state.charts.ctr.destroy();
  state.charts.ctr = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => fmtDate(d.date)),
      datasets: [
        { label: 'CTR (%)', data: data.map(d => Number(d.ctr || 0)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: false, tension: 0.4, pointRadius: 2, borderWidth: 2, yAxisID: 'y' },
        { label: 'CPC ($)', data: data.map(d => Number(d.cpc || 0)), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: false, tension: 0.4, pointRadius: 2, borderWidth: 2, yAxisID: 'y1' },
      ]
    },
    options: {
      ...chartOpts(),
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
        y: { position: 'left', grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => v.toFixed(2) + '%' } },
        y1: { position: 'right', grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => '$' + v.toFixed(2) } },
      }
    },
  });
}

function chartOpts(prefix = '') {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true, labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8', maxTicksLimit: 10 } },
      y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => prefix + fmtNum(v) } },
    },
    interaction: { intersect: false, mode: 'index' },
  };
}

// ---- CAMPAIGNS ----
async function renderCampaigns() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const { data } = await api.get('/campaigns?per_page=50');
    const campaigns = data.data?.campaigns || [];
    el.innerHTML = `
      <div class="space-y-4 fade-in">
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-500">${campaigns.length} campaigns</p>
          <button onclick="showCreateCampaign()" class="flex items-center gap-2 px-4 py-2 btn-primary text-white rounded-lg text-sm font-medium"><i class="fas fa-plus"></i> New Campaign</button>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b">
              <tr>
                <th class="text-left px-4 py-3 font-medium text-gray-500">Campaign</th>
                <th class="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th class="text-right px-4 py-3 font-medium text-gray-500">Budget</th>
                <th class="text-right px-4 py-3 font-medium text-gray-500">Spend</th>
                <th class="text-right px-4 py-3 font-medium text-gray-500">Impressions</th>
                <th class="text-right px-4 py-3 font-medium text-gray-500">Clicks</th>
                <th class="text-right px-4 py-3 font-medium text-gray-500">CTR</th>
                <th class="text-right px-4 py-3 font-medium text-gray-500">CPC</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${campaigns.length ? campaigns.map(c => {
                const m = c.metrics_7d || {};
                return `<tr class="hover:bg-gray-50 transition">
                  <td class="px-4 py-3"><div><p class="font-medium">${esc(c.name)}</p><p class="text-xs text-gray-400">${c.objective || ''} · ${c.adset_count || 0} ad sets</p></div></td>
                  <td class="px-4 py-3">${statusBadge(c.status)}</td>
                  <td class="px-4 py-3 text-right">${c.daily_budget ? fmtCurrency(c.daily_budget) + '/d' : '—'}</td>
                  <td class="px-4 py-3 text-right font-medium">${fmtCurrency(m.spend)}</td>
                  <td class="px-4 py-3 text-right">${fmtNum(m.impressions)}</td>
                  <td class="px-4 py-3 text-right">${fmtNum(m.clicks)}</td>
                  <td class="px-4 py-3 text-right font-medium ${Number(m.ctr) >= 1 ? 'text-success' : Number(m.ctr) > 0 ? 'text-warning' : ''}">${fmtPct(m.ctr)}</td>
                  <td class="px-4 py-3 text-right">${fmtCurrency(m.cpc)}</td>
                  <td class="px-4 py-3 text-right"><button onclick="analyzeCampaign('${c.id}')" class="text-brand-600 hover:text-brand-800 text-xs font-medium"><i class="fas fa-brain mr-1"></i>Analyze</button></td>
                </tr>`;
              }).join('') : '<tr><td colspan="9" class="text-center py-10 text-gray-400">No campaigns found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch {
    el.innerHTML = emptyState('Campaigns', 'Connect a Meta ad account to see your campaigns', 'fas fa-bullhorn');
  }
}

function showCreateCampaign() {
  openModal(`
    <div class="p-6">
      <h3 class="text-lg font-semibold mb-4"><i class="fas fa-plus-circle text-brand-500 mr-2"></i>Create Campaign</h3>
      <form onsubmit="createCampaign(event)" class="space-y-4">
        <div><label class="block text-sm font-medium mb-1">Campaign Name</label><input id="c-name" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
        <div><label class="block text-sm font-medium mb-1">Objective</label>
          <select id="c-objective" class="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="OUTCOME_TRAFFIC">Traffic</option>
            <option value="OUTCOME_CONVERSIONS">Conversions</option>
            <option value="OUTCOME_AWARENESS">Awareness</option>
            <option value="OUTCOME_ENGAGEMENT">Engagement</option>
            <option value="OUTCOME_LEADS">Leads</option>
            <option value="OUTCOME_SALES">Sales</option>
          </select>
        </div>
        <div><label class="block text-sm font-medium mb-1">Daily Budget ($)</label><input id="c-budget" type="number" step="0.01" min="1" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="50.00"></div>
        <div class="flex gap-3 pt-2">
          <button type="submit" class="flex-1 py-2 btn-primary text-white rounded-lg text-sm font-medium">Create</button>
          <button type="button" onclick="closeModal()" class="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
        </div>
      </form>
    </div>`);
}

async function createCampaign(e) {
  e.preventDefault();
  try {
    await api.post('/campaigns', {
      name: document.getElementById('c-name').value,
      objective: document.getElementById('c-objective').value,
      daily_budget: parseFloat(document.getElementById('c-budget').value) || undefined,
      ad_account_id: state.currentWorkspace,
    });
    closeModal();
    renderCampaigns();
  } catch (err) { alert(err.response?.data?.error?.message || 'Failed'); }
}

// ---- ADS MANAGER ----
async function renderAdsManager() {
  const el = document.getElementById('page-content');
  el.innerHTML = emptyState('Ads Manager', 'View and manage individual ads across all your campaigns. Ads are synced from your Meta ad accounts.', 'fas fa-ad');
}

// ---- AI ENGINE ----
async function renderAI() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="space-y-6 fade-in">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${aiFeatureCard('Campaign Analysis', 'Deep AI-powered performance diagnosis with specific recommendations', 'fas fa-microscope', 'brand', "navigate('campaigns')")}
        ${aiFeatureCard('Copy Generator', 'Generate high-converting ad copy using proven frameworks', 'fas fa-pen-fancy', 'emerald', "navigate('copy')")}
        ${aiFeatureCard('Headline Generator', 'Create dozens of attention-grabbing headlines instantly', 'fas fa-heading', 'amber', 'showHeadlineGen()')}
        ${aiFeatureCard('Creative Fatigue', 'Detect when your ads are losing effectiveness', 'fas fa-battery-quarter', 'rose', null)}
        ${aiFeatureCard('Budget Optimizer', 'AI-recommended budget allocation across campaigns', 'fas fa-coins', 'violet', 'showBudgetOptimizer()')}
        ${aiFeatureCard('Audience Insights', 'Get targeting recommendations based on performance', 'fas fa-users-cog', 'cyan', null)}
      </div>
      <div class="bg-white rounded-xl border p-5">
        <h3 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-history text-gray-400 mr-2"></i>Recent AI Analyses</h3>
        <div id="ai-history"><p class="text-sm text-gray-400 text-center py-6">Run an analysis to see results here</p></div>
      </div>
    </div>`;
  loadAIHistory();
}

function aiFeatureCard(title, desc, icon, color, onclick) {
  return `<div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition cursor-pointer ${onclick ? '' : 'opacity-60'}" ${onclick ? `onclick="${onclick}"` : ''}>
    <div class="w-10 h-10 rounded-lg bg-${color}-100 flex items-center justify-center mb-3"><i class="${icon} text-${color}-600"></i></div>
    <h4 class="font-semibold text-gray-900 text-sm">${title}</h4>
    <p class="text-xs text-gray-500 mt-1">${desc}</p>
  </div>`;
}

async function loadAIHistory() {
  try {
    const { data } = await api.get('/ai/history?limit=5');
    const items = data.data || [];
    const el = document.getElementById('ai-history');
    if (!el) return;
    if (items.length === 0) return;
    el.innerHTML = items.map(i => `
      <div class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
        <i class="fas fa-brain text-brand-400 text-xs"></i>
        <span class="text-sm flex-1">${i.analysis_type.replace(/_/g, ' ')}</span>
        <span class="text-xs text-gray-400">${fmtDate(i.created_at)}</span>
        <span class="text-xs px-2 py-0.5 rounded bg-brand-50 text-brand-600">${i.model_used}</span>
      </div>
    `).join('');
  } catch {}
}

async function analyzeCampaign(id) {
  openModal(`<div class="p-6 text-center"><i class="fas fa-brain fa-spin text-brand-500 text-3xl mb-4"></i><p class="text-sm text-gray-500">AI is analyzing your campaign...</p><p class="text-xs text-gray-400 mt-2">This may take 10-30 seconds</p></div>`);
  try {
    const { data } = await api.post('/ai/analyze-campaign', { campaign_id: id });
    const r = data.data;
    openModal(`
      <div class="p-6 space-y-4">
        <h3 class="text-lg font-semibold"><i class="fas fa-brain text-brand-500 mr-2"></i>AI Campaign Analysis</h3>
        <p class="text-sm text-gray-600">${esc(r.summary || '')}</p>
        ${r.findings?.length ? `<div><h4 class="text-sm font-semibold mb-2">Findings</h4>${r.findings.map(f => `
          <div class="flex items-start gap-2 p-2 rounded bg-${f.severity === 'critical' ? 'red' : f.severity === 'warning' ? 'amber' : 'blue'}-50 mb-2">
            <i class="fas fa-${f.severity === 'critical' ? 'exclamation-circle text-red-500' : f.severity === 'warning' ? 'exclamation-triangle text-amber-500' : 'info-circle text-blue-500'} mt-0.5"></i>
            <span class="text-sm">${esc(f.message)}</span>
          </div>`).join('')}</div>` : ''}
        ${r.recommendations?.length ? `<div><h4 class="text-sm font-semibold mb-2">Recommendations</h4>${r.recommendations.map(rec => `
          <div class="p-3 rounded-lg border mb-2">
            <div class="flex items-center gap-2 mb-1"><span class="text-xs px-1.5 py-0.5 rounded ${rec.priority === 'high' ? 'bg-red-100 text-red-700' : rec.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}">${rec.priority}</span><span class="text-sm font-medium">${esc(rec.title)}</span></div>
            <p class="text-xs text-gray-500">${esc(rec.description)}</p>
            <p class="text-xs text-brand-600 mt-1">Impact: ${esc(rec.estimated_impact || '')}</p>
          </div>`).join('')}</div>` : ''}
        <button onclick="closeModal()" class="w-full py-2 btn-primary text-white rounded-lg text-sm font-medium">Close</button>
      </div>`);
  } catch (err) {
    openModal(`<div class="p-6 text-center"><i class="fas fa-exclamation-circle text-danger text-3xl mb-3"></i><p class="text-sm">Analysis failed: ${err.response?.data?.error?.message || 'Unknown error'}</p><button onclick="closeModal()" class="mt-4 px-4 py-2 btn-primary text-white rounded-lg text-sm">Close</button></div>`);
  }
}

// ---- COPY GENERATOR ----
async function renderCopyGenerator() {
  const el = document.getElementById('page-content');
  el.innerHTML = `
    <div class="max-w-4xl mx-auto space-y-6 fade-in">
      <div class="bg-white rounded-xl border p-6">
        <h3 class="text-lg font-semibold mb-4"><i class="fas fa-pen-fancy text-brand-500 mr-2"></i>AI Ad Copy Generator</h3>
        <form onsubmit="generateCopy(event)" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium mb-1">Product/Service Name *</label><input id="cp-name" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
            <div><label class="block text-sm font-medium mb-1">Target Audience *</label><input id="cp-audience" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Women 25-45, fitness enthusiasts" required></div>
          </div>
          <div><label class="block text-sm font-medium mb-1">Product Description *</label><textarea id="cp-desc" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Describe what your product does and its key value proposition..." required></textarea></div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label class="block text-sm font-medium mb-1">Tone</label>
              <select id="cp-tone" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="professional">Professional</option><option value="casual">Casual</option><option value="urgent">Urgent</option><option value="emotional">Emotional</option><option value="humorous">Humorous</option><option value="conversational">Conversational</option><option value="provocative">Provocative</option>
              </select></div>
            <div><label class="block text-sm font-medium mb-1">Objective</label>
              <select id="cp-obj" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="OUTCOME_SALES">Sales</option><option value="OUTCOME_TRAFFIC">Traffic</option><option value="OUTCOME_LEADS">Leads</option><option value="OUTCOME_ENGAGEMENT">Engagement</option><option value="OUTCOME_AWARENESS">Awareness</option>
              </select></div>
            <div><label class="block text-sm font-medium mb-1">Variations</label><input id="cp-count" type="number" min="1" max="5" value="3" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
          </div>
          <div><label class="block text-sm font-medium mb-1">Key Benefits (one per line)</label><textarea id="cp-benefits" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Free shipping\n30-day guarantee\nResults in 7 days"></textarea></div>
          <button type="submit" id="cp-btn" class="px-6 py-2.5 btn-primary text-white rounded-lg text-sm font-medium"><i class="fas fa-magic mr-2"></i>Generate Copy</button>
        </form>
      </div>
      <div id="copy-results"></div>
    </div>`;
}

async function generateCopy(e) {
  e.preventDefault();
  const btn = document.getElementById('cp-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
  const results = document.getElementById('copy-results');
  results.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-brand-500 text-xl"></i><p class="text-sm text-gray-400 mt-2">AI is crafting your ad copy...</p></div>';

  try {
    const benefits = document.getElementById('cp-benefits').value.split('\n').filter(b => b.trim());
    const { data } = await api.post('/ai/generate-copy', {
      product_name: document.getElementById('cp-name').value,
      product_description: document.getElementById('cp-desc').value,
      target_audience: document.getElementById('cp-audience').value,
      tone: document.getElementById('cp-tone').value,
      objective: document.getElementById('cp-obj').value,
      variations_count: parseInt(document.getElementById('cp-count').value),
      key_benefits: benefits.length ? benefits : undefined,
    });
    const copies = data.data?.copies || [];
    results.innerHTML = copies.map((c, i) => `
      <div class="bg-white rounded-xl border p-5 mb-4 fade-in" style="animation-delay:${i * 0.1}s">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-1 rounded-full bg-brand-100 text-brand-700 font-semibold">${c.framework_used || 'AI'}</span>
            <span class="text-xs text-gray-400">Variation ${i + 1}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold ${c.score >= 85 ? 'text-success' : c.score >= 70 ? 'text-warning' : 'text-gray-500'}">${c.score}/100</span>
            <button onclick="copyText(this, '${esc(c.primary_text).replace(/'/g, "\\'")}')" class="text-xs text-brand-600 hover:underline"><i class="fas fa-copy mr-1"></i>Copy</button>
          </div>
        </div>
        <div class="space-y-2">
          <div><p class="text-[10px] text-gray-400 uppercase tracking-wider">Headline</p><p class="text-lg font-bold text-gray-900">${esc(c.headline)}</p></div>
          <div><p class="text-[10px] text-gray-400 uppercase tracking-wider">Primary Text</p><p class="text-sm text-gray-700 whitespace-pre-line">${esc(c.primary_text)}</p></div>
          ${c.description ? `<div><p class="text-[10px] text-gray-400 uppercase tracking-wider">Description</p><p class="text-sm text-gray-600">${esc(c.description)}</p></div>` : ''}
          <div class="flex items-center gap-3 pt-2 border-t border-gray-100">
            <span class="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700"><i class="fas fa-hand-pointer mr-1"></i>${c.call_to_action || 'LEARN_MORE'}</span>
            ${(c.hooks || []).slice(0, 2).map(h => `<span class="text-xs text-gray-400">💡 ${esc(h)}</span>`).join('')}
          </div>
        </div>
        ${c.reasoning ? `<p class="text-xs text-gray-400 mt-3 italic">${esc(c.reasoning)}</p>` : ''}
      </div>
    `).join('');
  } catch (err) {
    results.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700"><i class="fas fa-exclamation-circle mr-2"></i>${err.response?.data?.error?.message || 'Generation failed'}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate Copy';
  }
}

// ---- AUTOMATION ----
async function renderAutomation() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const [rulesRes, presetsRes] = await Promise.all([
      api.get('/automation/rules'),
      api.get('/automation/presets'),
    ]);
    const rules = rulesRes.data.data || [];
    const presets = presetsRes.data.data || [];

    el.innerHTML = `
      <div class="space-y-6 fade-in">
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-500">${rules.length} active rules</p>
          <button onclick="showCreateRule()" class="px-4 py-2 btn-primary text-white rounded-lg text-sm font-medium"><i class="fas fa-plus mr-1"></i>New Rule</button>
        </div>

        <!-- Active Rules -->
        <div class="space-y-3">
          ${rules.length ? rules.map(r => `
            <div class="bg-white rounded-xl border p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-3 h-3 rounded-full ${r.is_active ? 'bg-success pulse-dot' : 'bg-gray-300'}"></div>
                  <div>
                    <p class="font-medium text-sm">${esc(r.name)}</p>
                    <p class="text-xs text-gray-400">${r.scope} · ${(r.conditions || []).length} conditions · ${(r.actions || []).length} actions · Triggered ${r.trigger_count || 0}x</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button onclick="runRule('${r.id}')" class="text-xs px-3 py-1 rounded border hover:bg-gray-50"><i class="fas fa-play mr-1"></i>Run</button>
                  <button onclick="toggleRule('${r.id}', ${!r.is_active})" class="text-xs px-3 py-1 rounded border hover:bg-gray-50">${r.is_active ? 'Pause' : 'Enable'}</button>
                  <button onclick="deleteRule('${r.id}')" class="text-xs px-3 py-1 rounded border text-danger hover:bg-red-50"><i class="fas fa-trash"></i></button>
                </div>
              </div>
            </div>
          `).join('') : '<p class="text-sm text-gray-400 text-center py-6">No rules yet. Create one or use a preset below.</p>'}
        </div>

        <!-- Presets -->
        <div>
          <h3 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-magic text-brand-500 mr-2"></i>Rule Templates</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            ${presets.map(p => `
              <div class="bg-white rounded-xl border p-4 hover:shadow-md transition cursor-pointer" onclick="usePreset(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                <h4 class="font-medium text-sm mb-1">${esc(p.name)}</h4>
                <p class="text-xs text-gray-500 mb-2">${esc(p.description)}</p>
                <div class="flex flex-wrap gap-1">
                  ${p.conditions.map(c => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">${c.metric} ${c.operator.replace(/_/g,' ')} ${c.value}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  } catch {
    el.innerHTML = emptyState('Automation', 'Set up rules to automatically optimize your campaigns', 'fas fa-robot');
  }
}

function showCreateRule() {
  openModal(`
    <div class="p-6">
      <h3 class="text-lg font-semibold mb-4"><i class="fas fa-robot text-brand-500 mr-2"></i>Create Automation Rule</h3>
      <form onsubmit="createRule(event)" class="space-y-4">
        <div><label class="block text-sm font-medium mb-1">Rule Name</label><input id="r-name" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
        <div><label class="block text-sm font-medium mb-1">Scope</label>
          <select id="r-scope" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="campaign">Campaign</option><option value="adset">Ad Set</option><option value="ad">Ad</option></select></div>
        <div><label class="block text-sm font-medium mb-1">Condition: Metric</label>
          <select id="r-metric" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="ctr">CTR (%)</option><option value="cpc">CPC ($)</option><option value="cpm">CPM ($)</option><option value="spend">Spend ($)</option><option value="frequency">Frequency</option><option value="roas">ROAS</option><option value="impressions">Impressions</option></select></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm font-medium mb-1">Operator</label>
            <select id="r-op" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="less_than">Less than</option><option value="greater_than">Greater than</option><option value="equal_to">Equal to</option></select></div>
          <div><label class="block text-sm font-medium mb-1">Value</label><input id="r-val" type="number" step="any" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
        </div>
        <div><label class="block text-sm font-medium mb-1">Action</label>
          <select id="r-action" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="pause">Pause</option><option value="activate">Activate</option><option value="increase_budget">Increase Budget 20%</option><option value="decrease_budget">Decrease Budget 20%</option><option value="send_notification">Send Notification</option></select></div>
        <div class="flex gap-3 pt-2">
          <button type="submit" class="flex-1 py-2 btn-primary text-white rounded-lg text-sm font-medium">Create Rule</button>
          <button type="button" onclick="closeModal()" class="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
        </div>
      </form>
    </div>`);
}

async function createRule(e) {
  e.preventDefault();
  const actionType = document.getElementById('r-action').value;
  const actionParams = actionType.includes('budget') ? { percentage: 20 } : {};
  try {
    await api.post('/automation/rules', {
      name: document.getElementById('r-name').value,
      scope: document.getElementById('r-scope').value,
      conditions: [{ metric: document.getElementById('r-metric').value, operator: document.getElementById('r-op').value, value: parseFloat(document.getElementById('r-val').value) }],
      actions: [{ type: actionType, params: actionParams }],
      schedule: { frequency: 'every_6_hours' },
    });
    closeModal();
    renderAutomation();
  } catch (err) { alert(err.response?.data?.error?.message || 'Failed'); }
}

async function usePreset(preset) {
  try {
    await api.post('/automation/rules', {
      name: preset.name,
      description: preset.description,
      scope: preset.scope,
      conditions: preset.conditions,
      condition_logic: preset.condition_logic,
      actions: preset.actions,
      schedule: preset.schedule,
      lookback_window: preset.lookback_window,
      cooldown_period: preset.cooldown_period,
    });
    renderAutomation();
  } catch (err) { alert(err.response?.data?.error?.message || 'Failed'); }
}

async function runRule(id) { try { const {data}=await api.post(`/automation/rules/${id}/run`); alert(data.data?.message||'Done'); } catch(e){ alert(e.response?.data?.error?.message||'Failed'); } }
async function toggleRule(id, active) { try { await api.patch(`/automation/rules/${id}`, { is_active: active }); renderAutomation(); } catch {} }
async function deleteRule(id) { if(!confirm('Delete this rule?'))return; try { await api.delete(`/automation/rules/${id}`); renderAutomation(); } catch {} }

// ---- ACCOUNTS ----
async function renderAccounts() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const { data } = await api.get('/auth/meta/accounts');
    const accounts = data.data || [];
    el.innerHTML = `
      <div class="space-y-4 fade-in">
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-500">${accounts.length} connected accounts</p>
          <button onclick="connectMeta()" class="px-4 py-2 btn-primary text-white rounded-lg text-sm font-medium"><i class="fab fa-meta mr-2"></i>Connect Meta Account</button>
        </div>
        ${accounts.length ? accounts.map(a => `
          <div class="bg-white rounded-xl border p-5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center"><i class="fab fa-facebook text-blue-600 text-xl"></i></div>
                <div>
                  <p class="font-semibold">${esc(a.name)}</p>
                  <p class="text-xs text-gray-400">${a.meta_account_id} · ${a.currency} · ${a.timezone}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs px-2 py-1 rounded-full ${a.token_health==='healthy'?'bg-green-100 text-green-700':a.token_health==='expiring_soon'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}">${a.token_health}</span>
                ${statusBadge(a.account_status === 'active' ? 'ACTIVE' : 'PAUSED')}
              </div>
            </div>
            <div class="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
              <div><p class="text-xs text-gray-400">Amount Spent</p><p class="font-semibold">${fmtCurrency(a.amount_spent)}</p></div>
              <div><p class="text-xs text-gray-400">Balance</p><p class="font-semibold">${fmtCurrency(a.balance)}</p></div>
              <div><p class="text-xs text-gray-400">Last Synced</p><p class="text-sm">${a.last_synced_at ? fmtDate(a.last_synced_at) : 'Never'}</p></div>
            </div>
          </div>
        `).join('') : `
          <div class="bg-white rounded-xl border p-10 text-center">
            <i class="fab fa-meta text-blue-500 text-4xl mb-4"></i>
            <h3 class="text-lg font-semibold mb-2">Connect Your Meta Ad Account</h3>
            <p class="text-sm text-gray-500 mb-4 max-w-md mx-auto">Link your Facebook/Instagram ad accounts to start syncing campaigns, analyzing performance, and optimizing with AI.</p>
            <button onclick="connectMeta()" class="px-6 py-2.5 btn-primary text-white rounded-lg text-sm font-medium"><i class="fab fa-meta mr-2"></i>Connect with Meta</button>
          </div>`}
      </div>`;
  } catch {
    el.innerHTML = emptyState('Ad Accounts', 'Connect your Meta ad accounts to get started', 'fab fa-meta');
  }
}

async function connectMeta() {
  try {
    const { data } = await api.get(`/auth/meta/connect?workspace_id=${state.currentWorkspace}`);
    window.location.href = data.data.authUrl;
  } catch { alert('Meta connection requires META_APP_ID and META_APP_SECRET to be configured.'); }
}

// ---- BILLING ----
async function renderBilling() {
  const el = document.getElementById('page-content');
  try {
    const [statusRes, plansRes] = await Promise.all([
      api.get('/billing/status'),
      api.get('/billing/plans'),
    ]);
    const billing = statusRes.data.data;
    const plans = plansRes.data.data || [];

    el.innerHTML = `
      <div class="max-w-5xl mx-auto space-y-6 fade-in">
        <div class="bg-white rounded-xl border p-6">
          <h3 class="font-semibold mb-4">Current Plan: <span class="text-brand-600">${billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1)}</span></h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="p-3 rounded-lg bg-gray-50"><p class="text-xs text-gray-400">AI Requests</p><p class="font-semibold">${billing.usage.ai_requests} / ${billing.limits.ai_requests === -1 ? '∞' : billing.limits.ai_requests}</p></div>
            <div class="p-3 rounded-lg bg-gray-50"><p class="text-xs text-gray-400">Ad Accounts</p><p class="font-semibold">${billing.entity_counts.ad_accounts} / ${billing.limits.ad_accounts === -1 ? '∞' : billing.limits.ad_accounts}</p></div>
            <div class="p-3 rounded-lg bg-gray-50"><p class="text-xs text-gray-400">Campaigns</p><p class="font-semibold">${billing.entity_counts.campaigns} / ${billing.limits.campaigns === -1 ? '∞' : billing.limits.campaigns}</p></div>
            <div class="p-3 rounded-lg bg-gray-50"><p class="text-xs text-gray-400">Rules</p><p class="font-semibold">${billing.entity_counts.rules} / ${billing.limits.rules === -1 ? '∞' : billing.limits.rules}</p></div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          ${plans.map(p => `
            <div class="bg-white rounded-xl border ${p.popular ? 'border-brand-500 ring-2 ring-brand-100' : ''} p-5 flex flex-col">
              ${p.popular ? '<span class="text-xs text-brand-600 font-semibold mb-2">MOST POPULAR</span>' : ''}
              <h4 class="font-bold text-lg">${p.name}</h4>
              <p class="text-2xl font-bold mt-1">${p.price === 0 ? 'Free' : '$' + p.price}<span class="text-sm font-normal text-gray-400">/mo</span></p>
              <ul class="mt-4 space-y-2 flex-1">
                ${p.features.map(f => `<li class="flex items-start gap-2 text-sm"><i class="fas fa-check text-success text-xs mt-1"></i>${f}</li>`).join('')}
              </ul>
              <button onclick="upgradePlan('${p.id}')" class="mt-4 w-full py-2 rounded-lg text-sm font-medium ${billing.plan === p.id ? 'bg-gray-100 text-gray-500' : 'btn-primary text-white'}" ${billing.plan === p.id ? 'disabled' : ''}>${billing.plan === p.id ? 'Current Plan' : 'Upgrade'}</button>
            </div>
          `).join('')}
        </div>
      </div>`;
  } catch {
    el.innerHTML = emptyState('Billing', 'Manage your subscription and usage', 'fas fa-credit-card');
  }
}

async function upgradePlan(plan) {
  if (plan === 'free') return;
  try {
    const { data } = await api.post('/billing/create-checkout', { plan });
    if (data.data?.checkout_url) window.location.href = data.data.checkout_url;
  } catch { alert('Stripe is not configured. Set STRIPE_SECRET_KEY in environment.'); }
}

// ---- SETTINGS ----
function renderSettings() {
  document.getElementById('page-content').innerHTML = `
    <div class="max-w-2xl mx-auto space-y-6 fade-in">
      <div class="bg-white rounded-xl border p-6">
        <h3 class="font-semibold mb-4"><i class="fas fa-user text-brand-500 mr-2"></i>Profile</h3>
        <div class="space-y-3">
          <div><p class="text-xs text-gray-400">Name</p><p class="font-medium">${state.user?.name || 'N/A'}</p></div>
          <div><p class="text-xs text-gray-400">Email</p><p class="font-medium">${state.user?.email || 'N/A'}</p></div>
        </div>
      </div>
      <div class="bg-white rounded-xl border p-6">
        <h3 class="font-semibold mb-4"><i class="fas fa-cog text-gray-500 mr-2"></i>Workspace</h3>
        <div class="space-y-3">
          ${state.workspaces.map(w => `
            <div class="flex items-center justify-between p-3 rounded-lg ${w.id === state.currentWorkspace ? 'bg-brand-50 border border-brand-200' : 'bg-gray-50'}">
              <div><p class="font-medium text-sm">${esc(w.name)}</p><p class="text-xs text-gray-400">${w.plan} · ${w.role || 'member'}</p></div>
              ${w.id !== state.currentWorkspace ? `<button onclick="switchWorkspace('${w.id}')" class="text-xs text-brand-600">Switch</button>` : '<span class="text-xs text-brand-600">Active</span>'}
            </div>
          `).join('')}
        </div>
      </div>
      <button onclick="logout()" class="w-full py-2.5 border border-red-200 text-danger rounded-lg text-sm font-medium hover:bg-red-50 transition"><i class="fas fa-sign-out-alt mr-2"></i>Sign Out</button>
    </div>`;
}

function switchWorkspace(id) { state.currentWorkspace = id; localStorage.setItem('af_workspace', id); loadProfile(); }
function logout() { state.token=null; state.user=null; localStorage.removeItem('af_token'); localStorage.removeItem('af_workspace'); showAuth(); }

// ---- Headline Generator ----
function showHeadlineGen() {
  openModal(`
    <div class="p-6">
      <h3 class="text-lg font-semibold mb-4"><i class="fas fa-heading text-amber-500 mr-2"></i>Headline Generator</h3>
      <form onsubmit="genHeadlines(event)" class="space-y-4">
        <div><label class="block text-sm font-medium mb-1">Product Info</label><input id="hl-product" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
        <div><label class="block text-sm font-medium mb-1">Target Audience</label><input id="hl-audience" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
        <button type="submit" id="hl-btn" class="w-full py-2 btn-primary text-white rounded-lg text-sm font-medium">Generate 10 Headlines</button>
      </form>
      <div id="hl-results" class="mt-4"></div>
    </div>`);
}

async function genHeadlines(e) {
  e.preventDefault();
  document.getElementById('hl-btn').innerHTML='<i class="fas fa-spinner fa-spin mr-1"></i>Generating...';
  try {
    const {data}=await api.post('/ai/generate-headlines',{product_info:document.getElementById('hl-product').value,target_audience:document.getElementById('hl-audience').value,count:10});
    const hl=data.data?.headlines||[];
    document.getElementById('hl-results').innerHTML=hl.map(h=>`<div class="flex items-center justify-between py-2 border-b border-gray-50"><span class="text-sm">${esc(h.headline)}</span><span class="text-xs px-1.5 py-0.5 rounded ${h.score>=80?'bg-green-100 text-green-700':'bg-gray-100 text-gray-600'}">${h.score}</span></div>`).join('');
  } catch(err){ document.getElementById('hl-results').innerHTML=`<p class="text-sm text-danger">${err.response?.data?.error?.message||'Failed'}</p>`; }
  finally{ document.getElementById('hl-btn').innerHTML='Generate 10 Headlines'; }
}

// ---- Budget Optimizer ----
function showBudgetOptimizer() {
  openModal(`
    <div class="p-6">
      <h3 class="text-lg font-semibold mb-4"><i class="fas fa-coins text-violet-500 mr-2"></i>Budget Optimizer</h3>
      <form onsubmit="runBudgetOpt(event)" class="space-y-4">
        <div><label class="block text-sm font-medium mb-1">Total Daily Budget ($)</label><input id="bo-budget" type="number" step="0.01" min="1" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
        <button type="submit" id="bo-btn" class="w-full py-2 btn-primary text-white rounded-lg text-sm font-medium">Optimize Budget</button>
      </form>
      <div id="bo-results" class="mt-4"></div>
    </div>`);
}

async function runBudgetOpt(e) {
  e.preventDefault();
  document.getElementById('bo-btn').innerHTML='<i class="fas fa-spinner fa-spin mr-1"></i>Optimizing...';
  try {
    const {data}=await api.post('/ai/optimize-budget',{total_budget:parseFloat(document.getElementById('bo-budget').value)});
    const r=data.data;
    document.getElementById('bo-results').innerHTML=`<div class="bg-gray-50 rounded-lg p-4 mt-2"><p class="text-sm">${esc(r.summary||JSON.stringify(r))}</p></div>`;
  } catch(err){ document.getElementById('bo-results').innerHTML=`<p class="text-sm text-danger">${err.response?.data?.error?.message||'Failed'}</p>`; }
  finally{ document.getElementById('bo-btn').innerHTML='Optimize Budget'; }
}

// ---- Notifications ----
function showNotifications() { document.getElementById('notif-panel').classList.remove('hidden'); loadNotifications(); }
function hideNotifications() { document.getElementById('notif-panel').classList.add('hidden'); }

async function loadNotifications() {
  try {
    const {data}=await api.get('/dashboard/notifications?limit=20');
    const notifs=data.data?.notifications||[];
    const badge=document.getElementById('notif-badge');
    const unread=data.data?.unread_count||0;
    if(unread>0){badge.textContent=unread;badge.classList.remove('hidden');}else{badge.classList.add('hidden');}
    document.getElementById('notif-list').innerHTML=notifs.length?notifs.map(n=>`
      <div class="p-3 rounded-lg ${n.is_read?'bg-white':'bg-brand-50'} border">
        <div class="flex items-start gap-2">
          <i class="fas fa-${n.type==='rule_triggered'?'robot text-brand-500':n.type==='token_expiring'?'exclamation-triangle text-amber-500':'bell text-gray-400'} mt-0.5"></i>
          <div class="flex-1"><p class="text-sm font-medium">${esc(n.title)}</p><p class="text-xs text-gray-500 mt-0.5">${esc(n.message)}</p><p class="text-[10px] text-gray-400 mt-1">${fmtDate(n.created_at)}</p></div>
        </div>
      </div>`).join(''):'<p class="text-sm text-gray-400 text-center py-8">No notifications</p>';
  } catch {}
}

async function syncAll() {
  const btn = document.getElementById('sync-btn');
  btn.innerHTML = '<i class="fas fa-sync-alt fa-spin text-xs"></i> Syncing...';
  btn.disabled = true;
  try { await api.post('/campaigns/sync-all'); if (state.currentPage==='dashboard') renderDashboard(); } catch {}
  finally { btn.innerHTML = '<i class="fas fa-sync-alt text-xs"></i> Sync'; btn.disabled = false; }
}

// ---- Helpers ----
function openModal(html) { document.getElementById('modal-content').innerHTML=html; document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }
function fmtCurrency(v) { return '$'+(Number(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtNum(v) { const n=Number(v)||0; if(n>=1e6)return(n/1e6).toFixed(1)+'M'; if(n>=1e3)return(n/1e3).toFixed(1)+'K'; return n.toLocaleString(); }
function fmtPct(v) { return (Number(v)||0).toFixed(2)+'%'; }
function fmtDate(d) { if(!d)return ''; try{return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});}catch{return '';} }
function esc(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function statusBadge(s) { const m={ACTIVE:'bg-green-100 text-green-700',PAUSED:'bg-amber-100 text-amber-700',DELETED:'bg-red-100 text-red-700',ARCHIVED:'bg-gray-100 text-gray-500'}; return `<span class="text-xs px-2 py-0.5 rounded-full font-medium ${m[s]||'bg-gray-100 text-gray-500'}">${s||'UNKNOWN'}</span>`; }
function emptyState(title,desc,icon) { return `<div class="flex flex-col items-center justify-center py-20 fade-in"><i class="${icon} text-gray-300 text-5xl mb-4"></i><h3 class="text-lg font-semibold text-gray-700 mb-2">${title}</h3><p class="text-sm text-gray-400 max-w-md text-center">${desc}</p></div>`; }
function metricCard(label,value,change,icon,color) {
  const ch = change !== null && change !== undefined ? `<span class="text-xs ${change>0?'text-success':'text-danger'}">${change>0?'+':''}${change.toFixed(1)}%</span>` : '';
  return `<div class="metric-card bg-white rounded-xl border border-gray-200 p-4"><div class="flex items-center justify-between mb-2"><span class="text-xs text-gray-400">${label}</span><div class="w-7 h-7 rounded-lg bg-${color}-100 flex items-center justify-center"><i class="${icon} text-${color}-600 text-xs"></i></div></div><p class="text-xl font-bold text-gray-900">${value}</p>${ch}</div>`;
}
function copyText(btn, text) { navigator.clipboard.writeText(text); btn.innerHTML='<i class="fas fa-check mr-1"></i>Copied'; setTimeout(()=>{btn.innerHTML='<i class="fas fa-copy mr-1"></i>Copy';},2000); }

// ============================================
// AD FUSION v2.0 — New Feature Pages
// Creative Hub, A/B Testing, Competitors, Attribution, Audit, CAPI
// ============================================

// ---- Navigation Update ----
// Override navigate to include new pages
const _origNavigate = navigate;
function navigate(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
    if (el.dataset.page !== page) el.classList.add('text-gray-600');
    else el.classList.remove('text-gray-600');
  });
  const titles = {
    dashboard:'Dashboard', campaigns:'Campaigns', ads:'Ads Manager', ai:'AI Engine',
    automation:'Automation', copy:'Copy Generator', accounts:'Ad Accounts', billing:'Billing', settings:'Settings',
    creative:'Creative Hub', abtests:'A/B Testing', competitors:'Competitor Intel',
    attribution:'Cross-Channel Attribution', audit:'Health Audit', capi:'CAPI Tracking',
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  const pages = {
    dashboard: renderDashboard, campaigns: renderCampaigns, ads: renderAdsManager, ai: renderAI,
    automation: renderAutomation, copy: renderCopyGenerator, accounts: renderAccounts, billing: renderBilling, settings: renderSettings,
    creative: renderCreativeHub, abtests: renderABTests, competitors: renderCompetitors,
    attribution: renderAttribution, audit: renderAudit, capi: renderCAPI,
  };
  const renderer = pages[page];
  if (renderer) renderer();
}

// ---- CREATIVE HUB ----
async function renderCreativeHub() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const [leaderboardRes, diversityRes, winnersRes] = await Promise.all([
      api.get('/creative/leaderboard?limit=10').catch(() => null),
      api.get('/creative/diversity').catch(() => null),
      api.get('/creative/winners').catch(() => null),
    ]);
    const leaderboard = leaderboardRes?.data?.data || [];
    const diversity = diversityRes?.data?.data || {};
    const winners = winnersRes?.data?.data || {};

    el.innerHTML = `
      <div class="space-y-6 fade-in">
        <!-- Diversity Score -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          ${metricCard('Diversity Score', (diversity.diversity_score||0)+'/100', null, 'fas fa-palette', 'brand')}
          ${metricCard('Total Creatives', fmtNum(diversity.total_creatives||0), null, 'fas fa-images', 'blue')}
          ${metricCard('Healthy', fmtNum(diversity.healthy_count||0), null, 'fas fa-heart', 'emerald')}
          ${metricCard('Fatigued', fmtNum((diversity.fatigued_count||0)+(diversity.critical_count||0)), null, 'fas fa-battery-quarter', 'rose')}
        </div>

        <!-- Format Breakdown -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-4"><i class="fas fa-chart-pie text-brand-500 mr-2"></i>Format Breakdown</h3>
            <div class="space-y-2">
              ${Object.entries(diversity.format_breakdown||{}).map(([type, count]) => `
                <div class="flex items-center justify-between py-1.5">
                  <span class="text-sm capitalize">${type}</span>
                  <div class="flex items-center gap-2">
                    <div class="w-24 h-2 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-brand-500 rounded-full" style="width:${diversity.total_creatives?((count/diversity.total_creatives)*100).toFixed(0):0}%"></div></div>
                    <span class="text-xs text-gray-500 w-8">${count}</span>
                  </div>
                </div>
              `).join('') || '<p class="text-sm text-gray-400 text-center py-4">No creatives indexed yet</p>'}
            </div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-4"><i class="fas fa-lightbulb text-amber-500 mr-2"></i>Recommendations</h3>
            <div class="space-y-2">
              ${(diversity.recommendations||[]).map(r => `<div class="flex items-start gap-2 p-2 bg-amber-50 rounded-lg"><i class="fas fa-arrow-right text-amber-500 mt-0.5 text-xs"></i><span class="text-sm">${esc(r)}</span></div>`).join('') || '<p class="text-sm text-gray-400 text-center py-4">No recommendations</p>'}
            </div>
          </div>
        </div>

        <!-- Winners -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h3 class="text-sm font-semibold text-gray-700 mb-4"><i class="fas fa-trophy text-yellow-500 mr-2"></i>Creative Winners (${winners.winners||0})</h3>
          <p class="text-xs text-gray-400">${Object.entries(winners.categories||{}).map(([k,v]) => `${v}`).join(' · ') || 'Run sync to identify winners'}</p>
        </div>

        <!-- Leaderboard -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-ranking-star text-brand-500 mr-2"></i>Creative Leaderboard</h3>
            <button onclick="syncCreatives()" class="text-xs text-brand-600 hover:underline"><i class="fas fa-sync-alt mr-1"></i>Sync Creatives</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left px-3 py-2 text-xs text-gray-500">Creative</th>
                <th class="text-left px-3 py-2 text-xs text-gray-500">Type</th>
                <th class="text-right px-3 py-2 text-xs text-gray-500">CTR</th>
                <th class="text-right px-3 py-2 text-xs text-gray-500">Spend</th>
                <th class="text-right px-3 py-2 text-xs text-gray-500">Fatigue</th>
                <th class="text-center px-3 py-2 text-xs text-gray-500">Status</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-50">
                ${leaderboard.length ? leaderboard.map(c => `<tr class="hover:bg-gray-50">
                  <td class="px-3 py-2"><p class="font-medium truncate max-w-[200px]">${esc(c.name)}</p></td>
                  <td class="px-3 py-2 capitalize text-gray-500">${c.asset_type}</td>
                  <td class="px-3 py-2 text-right font-medium ${Number(c.avg_ctr)>=1?'text-success':'text-gray-700'}">${fmtPct(c.avg_ctr)}</td>
                  <td class="px-3 py-2 text-right">${fmtCurrency(c.total_spend)}</td>
                  <td class="px-3 py-2 text-right">${Number(c.fatigue_score).toFixed(0)}/100</td>
                  <td class="px-3 py-2 text-center">${fatigueBadge(c.fatigue_status)}</td>
                </tr>`).join('') : '<tr><td colspan="6" class="text-center py-8 text-gray-400">No creatives indexed yet. Click Sync Creatives to start.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  } catch { el.innerHTML = emptyState('Creative Hub', 'Connect your Meta ad account and sync creatives to see your Creative Intelligence dashboard.', 'fas fa-palette'); }
}

function fatigueBadge(status) {
  const m = {healthy:'bg-green-100 text-green-700', early_warning:'bg-amber-100 text-amber-700', fatigued:'bg-orange-100 text-orange-700', critical:'bg-red-100 text-red-700'};
  return `<span class="text-xs px-2 py-0.5 rounded-full font-medium ${m[status]||'bg-gray-100 text-gray-500'}">${(status||'unknown').replace('_',' ')}</span>`;
}

async function syncCreatives() {
  try { await api.post('/creative/sync', { ad_account_id: state.currentWorkspace }); renderCreativeHub(); } catch(e) { alert('Sync failed: ' + (e.response?.data?.error?.message||'error')); }
}

// ---- A/B TESTING ----
async function renderABTests() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const {data} = await api.get('/abtests');
    const tests = data.data || [];
    el.innerHTML = `
      <div class="space-y-6 fade-in">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">${tests.length} A/B test(s)</p>
            <p class="text-xs text-gray-400">Statistical significance engine with auto-winner detection</p>
          </div>
          <button onclick="showCreateABTest()" class="flex items-center gap-2 px-4 py-2 btn-primary text-white rounded-lg text-sm font-medium"><i class="fas fa-flask"></i> New A/B Test</button>
        </div>
        <div class="grid grid-cols-1 gap-4">
          ${tests.length ? tests.map(t => `
            <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h4 class="font-semibold text-gray-900">${esc(t.name)}</h4>
                  <p class="text-xs text-gray-400">${t.test_type} test · ${(t.variants||[]).length} variants</p>
                </div>
                ${statusBadge(t.status.toUpperCase())}
              </div>
              ${t.hypothesis ? `<p class="text-sm text-gray-600 mb-2"><i class="fas fa-lightbulb text-amber-400 mr-1"></i>${esc(t.hypothesis)}</p>` : ''}
              <div class="flex items-center gap-4 text-xs text-gray-500">
                <span><i class="fas fa-bullseye mr-1"></i>Metric: ${t.primary_metric}</span>
                <span><i class="fas fa-chart-bar mr-1"></i>Confidence: ${((t.confidence_level||0.95)*100).toFixed(0)}%</span>
                ${t.winner_variant_id ? `<span class="text-success font-medium"><i class="fas fa-trophy mr-1"></i>Winner found! +${(t.lift_percentage||0).toFixed(1)}% lift</span>` : ''}
                ${t.started_at ? `<span><i class="fas fa-clock mr-1"></i>Started ${fmtDate(t.started_at)}</span>` : ''}
              </div>
            </div>
          `).join('') : emptyState('A/B Tests', 'Create your first A/B test to measure what really works with statistical significance.', 'fas fa-flask')}
        </div>
      </div>`;
  } catch { el.innerHTML = emptyState('A/B Testing', 'A/B testing with statistical significance engine.', 'fas fa-flask'); }
}

function showCreateABTest() {
  openModal(`<div class="p-6"><h3 class="text-lg font-semibold mb-4"><i class="fas fa-flask text-brand-500 mr-2"></i>Create A/B Test</h3>
    <form onsubmit="createABTest(event)" class="space-y-4">
      <div><label class="block text-sm font-medium mb-1">Test Name</label><input id="ab-name" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
      <div><label class="block text-sm font-medium mb-1">Test Type</label><select id="ab-type" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="creative">Creative</option><option value="audience">Audience</option><option value="copy">Copy</option><option value="placement">Placement</option><option value="budget">Budget</option></select></div>
      <div><label class="block text-sm font-medium mb-1">Hypothesis</label><textarea id="ab-hypothesis" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g., Video ads will outperform static images for our target audience"></textarea></div>
      <div><label class="block text-sm font-medium mb-1">Primary Metric</label><select id="ab-metric" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="ctr">CTR</option><option value="cpc">CPC</option><option value="roas">ROAS</option><option value="conversion_rate">Conversion Rate</option></select></div>
      <p class="text-xs text-gray-400">After creating, add variants and start the test.</p>
      <div class="flex gap-3 pt-2">
        <button type="submit" class="flex-1 py-2 btn-primary text-white rounded-lg text-sm font-medium">Create Test</button>
        <button type="button" onclick="closeModal()" class="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
      </div>
    </form></div>`);
}

async function createABTest(e) {
  e.preventDefault();
  try {
    await api.post('/abtests', {
      name: document.getElementById('ab-name').value,
      test_type: document.getElementById('ab-type').value,
      hypothesis: document.getElementById('ab-hypothesis').value,
      primary_metric: document.getElementById('ab-metric').value,
      variants: [
        { name: 'Control', entity_type: 'campaign', entity_id: 'placeholder', traffic_split: 50, is_control: true },
        { name: 'Variant B', entity_type: 'campaign', entity_id: 'placeholder', traffic_split: 50, is_control: false },
      ],
    });
    closeModal(); renderABTests();
  } catch(err) { alert(err.response?.data?.error?.message || 'Failed'); }
}

// ---- COMPETITOR INTELLIGENCE ----
async function renderCompetitors() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const [compRes, landscapeRes] = await Promise.all([
      api.get('/competitors').catch(() => null),
      api.get('/competitors/landscape').catch(() => null),
    ]);
    const competitors = compRes?.data?.data || [];
    const landscape = landscapeRes?.data?.data || {};

    el.innerHTML = `
      <div class="space-y-6 fade-in">
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-500">${competitors.length} competitor(s) tracked</p>
          <button onclick="showAddCompetitor()" class="flex items-center gap-2 px-4 py-2 btn-primary text-white rounded-lg text-sm font-medium"><i class="fas fa-plus"></i> Add Competitor</button>
        </div>

        <!-- Competitors Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${competitors.length ? competitors.map(c => `
            <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center"><i class="fas fa-building text-brand-600"></i></div>
                <div><h4 class="font-semibold text-sm">${esc(c.name)}</h4><p class="text-xs text-gray-400">${c.industry||'Unknown industry'}</p></div>
              </div>
              <div class="flex items-center gap-4 text-xs text-gray-500">
                <span><i class="fas fa-ad mr-1"></i>${c.total_ads||0} ads</span>
                <span class="text-success"><i class="fas fa-play mr-1"></i>${c.active_ads||0} active</span>
              </div>
              <div class="flex gap-2 mt-3">
                <button onclick="fetchCompetitorAds('${c.id}')" class="text-xs text-brand-600 hover:underline"><i class="fas fa-download mr-1"></i>Fetch Ads</button>
                ${c.meta_page_id ? '' : '<span class="text-xs text-gray-400">No Meta page ID</span>'}
              </div>
            </div>
          `).join('') : ''}
        </div>

        <!-- Landscape Insights -->
        ${(landscape.top_hooks||[]).length ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-magnet text-rose-500 mr-2"></i>Top Hooks Used by Competitors</h3>
            <div class="space-y-1">${landscape.top_hooks.map(([hook, count]) => `<div class="flex items-center justify-between py-1"><span class="text-sm capitalize">${esc(hook)}</span><span class="text-xs text-gray-400">${count}x</span></div>`).join('')}</div>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-lightbulb text-amber-500 mr-2"></i>Actionable Insights</h3>
            <div class="space-y-2">${(landscape.actionable_insights||[]).slice(0,5).map(i => `<div class="flex items-start gap-2 p-2 bg-amber-50 rounded"><i class="fas fa-arrow-right text-amber-500 mt-0.5 text-xs"></i><span class="text-sm">${esc(i)}</span></div>`).join('')}</div>
          </div>
        </div>` : ''}

        ${!competitors.length ? emptyState('Competitor Intelligence', 'Track competitor ads from Meta Ad Library and get AI-powered analysis of their strategies.', 'fas fa-binoculars') : ''}
      </div>`;
  } catch { el.innerHTML = emptyState('Competitor Intelligence', 'Track competitor ads and strategies.', 'fas fa-binoculars'); }
}

function showAddCompetitor() {
  openModal(`<div class="p-6"><h3 class="text-lg font-semibold mb-4"><i class="fas fa-binoculars text-brand-500 mr-2"></i>Add Competitor</h3>
    <form onsubmit="addCompetitor(event)" class="space-y-4">
      <div><label class="block text-sm font-medium mb-1">Competitor Name *</label><input id="comp-name" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
      <div><label class="block text-sm font-medium mb-1">Meta Page ID</label><input id="comp-pageid" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g., 123456789"></div>
      <div><label class="block text-sm font-medium mb-1">Website URL</label><input id="comp-url" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://competitor.com"></div>
      <div><label class="block text-sm font-medium mb-1">Industry</label><input id="comp-industry" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g., E-commerce, SaaS"></div>
      <div class="flex gap-3 pt-2">
        <button type="submit" class="flex-1 py-2 btn-primary text-white rounded-lg text-sm font-medium">Add</button>
        <button type="button" onclick="closeModal()" class="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
      </div>
    </form></div>`);
}

async function addCompetitor(e) {
  e.preventDefault();
  try {
    await api.post('/competitors', {
      name: document.getElementById('comp-name').value,
      meta_page_id: document.getElementById('comp-pageid').value || undefined,
      website_url: document.getElementById('comp-url').value || undefined,
      industry: document.getElementById('comp-industry').value || undefined,
    });
    closeModal(); renderCompetitors();
  } catch(err) { alert(err.response?.data?.error?.message || 'Failed'); }
}

async function fetchCompetitorAds(id) {
  try { const {data} = await api.post(`/competitors/${id}/fetch-ads`); alert(`${data.data?.imported||0} ads imported`); renderCompetitors(); } catch(e) { alert('Failed: ' + (e.response?.data?.error?.message||'error')); }
}

// ---- CROSS-CHANNEL ATTRIBUTION ----
async function renderAttribution() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const days = state.dateRange;
    const df = new Date(Date.now() - days * 864e5).toISOString().split('T')[0];
    const dt = new Date().toISOString().split('T')[0];
    const [channelsRes, reportRes] = await Promise.all([
      api.get('/attribution/channels').catch(() => null),
      api.get(`/attribution/report?date_from=${df}&date_to=${dt}`).catch(() => null),
    ]);
    const channels = channelsRes?.data?.data || [];
    const report = reportRes?.data?.data || {};
    const blended = report.blended || {};

    el.innerHTML = `
      <div class="space-y-6 fade-in">
        <!-- Blended KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          ${metricCard('Total Spend', fmtCurrency(blended.total_spend), null, 'fas fa-dollar-sign', 'brand')}
          ${metricCard('Total Revenue', fmtCurrency(blended.total_revenue), null, 'fas fa-coins', 'emerald')}
          ${metricCard('MER', (blended.mer||0).toFixed(2)+'x', null, 'fas fa-chart-line', 'violet')}
          ${metricCard('Blended ROAS', (blended.blended_roas||0).toFixed(2)+'x', null, 'fas fa-trophy', 'amber')}
          ${metricCard('Blended CAC', fmtCurrency(blended.blended_cac), null, 'fas fa-user-plus', 'cyan')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Channel Mix -->
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <h3 class="text-sm font-semibold text-gray-700 mb-4"><i class="fas fa-project-diagram text-brand-500 mr-2"></i>Channel Mix</h3>
            ${(report.channels||[]).length ? `<div class="space-y-3">
              ${report.channels.map(c => `
                <div class="flex items-center gap-3">
                  <div class="w-20 text-sm font-medium capitalize">${esc(c.name)}</div>
                  <div class="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden flex">
                    <div class="h-full bg-brand-500 flex items-center justify-center text-white text-[10px]" style="width:${c.share_of_spend.toFixed(0)}%">${c.share_of_spend.toFixed(0)}%</div>
                  </div>
                  <div class="text-right text-xs text-gray-500 w-20">${fmtCurrency(c.spend)}</div>
                  <div class="text-right text-xs font-medium w-16">${c.roas.toFixed(2)}x</div>
                </div>
              `).join('')}
            </div>` : '<p class="text-sm text-gray-400 text-center py-4">No attribution data yet</p>'}
          </div>

          <!-- Channels -->
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-layer-group text-emerald-500 mr-2"></i>Channels (${channels.length})</h3>
              <button onclick="importMetaAttribution()" class="text-xs text-brand-600 hover:underline"><i class="fas fa-sync-alt mr-1"></i>Import Meta Data</button>
            </div>
            <div class="space-y-2">
              ${channels.map(c => `
                <div class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <div class="w-2 h-2 rounded-full ${c.is_active?'bg-success':'bg-gray-300'}"></div>
                  <span class="text-sm font-medium capitalize">${esc(c.channel_name)}</span>
                  <span class="text-xs text-gray-400">${c.channel_type}</span>
                  ${c.last_imported_at ? `<span class="text-xs text-gray-400 ml-auto">Last: ${fmtDate(c.last_imported_at)}</span>` : ''}
                </div>
              `).join('') || '<p class="text-sm text-gray-400 text-center py-4">No channels configured</p>'}
            </div>
          </div>
        </div>
      </div>`;
  } catch { el.innerHTML = emptyState('Cross-Channel Attribution', 'Track spend and revenue across all marketing channels for blended ROAS and MER.', 'fas fa-project-diagram'); }
}

async function importMetaAttribution() {
  try { await api.post('/attribution/import-meta'); await api.post('/attribution/calculate-blended'); renderAttribution(); } catch(e) { alert('Import failed'); }
}

// ---- HEALTH AUDIT ----
async function renderAudit() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const [recsRes, historyRes] = await Promise.all([
      api.get('/audit/recommendations').catch(() => null),
      api.get('/audit/history').catch(() => null),
    ]);
    const recs = recsRes?.data?.data || [];
    const history = historyRes?.data?.data || [];
    const latestAudit = history[0];

    el.innerHTML = `
      <div class="space-y-6 fade-in">
        <!-- Health Score -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          ${metricCard('Health Score', latestAudit ? (Number(latestAudit.health_score).toFixed(0)+'/100') : 'N/A', null, 'fas fa-heartbeat', latestAudit?.health_score >= 80 ? 'emerald' : latestAudit?.health_score >= 60 ? 'amber' : 'rose')}
          ${metricCard('Pending Recs', recs.length, null, 'fas fa-clipboard-check', 'brand')}
          ${metricCard('Issues Found', latestAudit?.issues_found || 0, null, 'fas fa-exclamation-triangle', 'amber')}
          ${metricCard('Entities Scanned', latestAudit?.entities_scanned || 0, null, 'fas fa-search', 'blue')}
        </div>

        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-700">Last audit: ${latestAudit ? fmtDate(latestAudit.started_at) : 'Never'}</h3>
          <button onclick="runAudit()" id="audit-btn" class="flex items-center gap-2 px-4 py-2 btn-primary text-white rounded-lg text-sm font-medium"><i class="fas fa-stethoscope"></i> Run Audit Now</button>
        </div>

        <!-- Pending Recommendations -->
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h3 class="text-sm font-semibold text-gray-700 mb-4"><i class="fas fa-magic text-brand-500 mr-2"></i>AI Recommendations (${recs.length})</h3>
          <div class="space-y-3">
            ${recs.length ? recs.map(r => `
              <div class="p-4 rounded-lg border ${r.priority==='critical'?'border-red-200 bg-red-50':r.priority==='high'?'border-amber-200 bg-amber-50':'border-gray-200'}">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xs px-1.5 py-0.5 rounded ${r.priority==='critical'?'bg-red-100 text-red-700':r.priority==='high'?'bg-amber-100 text-amber-700':'bg-gray-100 text-gray-600'}">${r.priority}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded bg-brand-50 text-brand-600">${(r.category||'').replace(/_/g,' ')}</span>
                  <h4 class="text-sm font-medium flex-1">${esc(r.title)}</h4>
                </div>
                <p class="text-sm text-gray-600 mb-2">${esc(r.description)}</p>
                ${r.rationale ? `<p class="text-xs text-gray-400 mb-2"><i class="fas fa-chart-bar mr-1"></i>${esc(r.rationale)}</p>` : ''}
                <div class="flex gap-2">
                  <button onclick="applyRecommendation('${r.id}')" class="text-xs px-3 py-1 btn-primary text-white rounded font-medium"><i class="fas fa-check mr-1"></i>Apply</button>
                  <button onclick="dismissRecommendation('${r.id}')" class="text-xs px-3 py-1 border rounded text-gray-500 hover:bg-gray-50"><i class="fas fa-times mr-1"></i>Dismiss</button>
                </div>
              </div>
            `).join('') : '<p class="text-sm text-gray-400 text-center py-6">No pending recommendations. Run an audit to generate AI-powered recommendations.</p>'}
          </div>
        </div>

        <!-- Audit History -->
        ${history.length ? `
        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <h3 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-history text-gray-400 mr-2"></i>Audit History</h3>
          <div class="space-y-2">
            ${history.slice(0,5).map(a => `
              <div class="flex items-center gap-3 py-2 border-b border-gray-50">
                <div class="w-10 h-10 rounded-lg ${Number(a.health_score)>=80?'bg-emerald-100':Number(a.health_score)>=60?'bg-amber-100':'bg-red-100'} flex items-center justify-center">
                  <span class="text-sm font-bold ${Number(a.health_score)>=80?'text-emerald-700':Number(a.health_score)>=60?'text-amber-700':'text-red-700'}">${Number(a.health_score).toFixed(0)}</span>
                </div>
                <div class="flex-1"><p class="text-sm">${a.run_type} audit · ${a.entities_scanned} scanned</p><p class="text-xs text-gray-400">${fmtDate(a.started_at)} · ${a.processing_time_ms?((a.processing_time_ms/1000).toFixed(1)+'s'):'N/A'}</p></div>
                <span class="text-xs ${a.status==='completed'?'text-success':'text-danger'}">${a.status}</span>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>`;
  } catch { el.innerHTML = emptyState('Health Audit', 'AI-powered account health audits with actionable recommendations.', 'fas fa-stethoscope'); }
}

async function runAudit() {
  const btn = document.getElementById('audit-btn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Running Audit...';
  btn.disabled = true;
  try { await api.post('/audit/run'); renderAudit(); }
  catch(e) { alert('Audit failed: ' + (e.response?.data?.error?.message||'error')); }
  finally { btn.innerHTML = '<i class="fas fa-stethoscope mr-2"></i>Run Audit Now'; btn.disabled = false; }
}

async function applyRecommendation(id) {
  try { await api.post(`/audit/recommendations/${id}/apply`); renderAudit(); } catch { alert('Failed to apply'); }
}

async function dismissRecommendation(id) {
  try { await api.post(`/audit/recommendations/${id}/dismiss`, { reason: 'User dismissed' }); renderAudit(); } catch { alert('Failed to dismiss'); }
}

// ---- CAPI TRACKING ----
async function renderCAPI() {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="flex items-center justify-center py-20"><i class="fas fa-spinner fa-spin text-brand-500 text-2xl"></i></div>';
  try {
    const [configsRes, statsRes] = await Promise.all([
      api.get('/capi/configurations').catch(() => null),
      api.get('/capi/stats').catch(() => null),
    ]);
    const configs = configsRes?.data?.data || [];
    const stats = statsRes?.data?.data || {};

    el.innerHTML = `
      <div class="space-y-6 fade-in">
        <div class="bg-gradient-to-r from-brand-600 to-brand-800 rounded-xl p-6 text-white">
          <div class="flex items-center gap-3 mb-2">
            <i class="fas fa-server text-2xl"></i>
            <div>
              <h3 class="text-lg font-semibold">Meta Conversions API (CAPI)</h3>
              <p class="text-sm text-brand-200">Server-side event tracking with automatic deduplication</p>
            </div>
          </div>
          <p class="text-sm text-brand-100 mt-2"><i class="fas fa-shield-alt mr-1"></i>iOS 14.5+ causes 20-30% conversion under-reporting. CAPI recovers lost signals through server-side tracking.</p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${metricCard('Pixels Configured', configs.length, null, 'fas fa-crosshairs', 'brand')}
          ${metricCard('Events Sent Today', configs.reduce((s,c)=>s+(c.events_sent_today||0),0), null, 'fas fa-paper-plane', 'emerald')}
          ${metricCard('Events Deduped', configs.reduce((s,c)=>s+(c.events_deduped_today||0),0), null, 'fas fa-filter', 'amber')}
          ${metricCard('Active', configs.filter(c=>c.is_active).length, null, 'fas fa-check-circle', 'cyan')}
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-cog text-gray-400 mr-2"></i>Pixel Configurations</h3>
            <button onclick="showConfigureCAPI()" class="text-xs text-brand-600 hover:underline"><i class="fas fa-plus mr-1"></i>Add Pixel</button>
          </div>
          ${configs.length ? `<div class="space-y-3">${configs.map(c => `
            <div class="p-4 rounded-lg border ${c.last_error?'border-red-200 bg-red-50':'border-gray-200'}">
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full ${c.is_active?'bg-success':'bg-gray-300'}"></div>
                  <span class="text-sm font-medium">Pixel: ${esc(c.pixel_id)}</span>
                  <span class="text-xs text-gray-400">${esc(c.account_name||'')}</span>
                </div>
              </div>
              <div class="flex items-center gap-4 text-xs text-gray-500 mt-2">
                <span><i class="fas fa-paper-plane mr-1"></i>${c.events_sent_today||0} sent today</span>
                <span><i class="fas fa-filter mr-1"></i>${c.events_deduped_today||0} deduped</span>
                ${c.last_event_at ? `<span><i class="fas fa-clock mr-1"></i>Last: ${fmtDate(c.last_event_at)}</span>` : ''}
                ${c.last_error ? `<span class="text-danger"><i class="fas fa-exclamation-circle mr-1"></i>${esc(c.last_error.substring(0,60))}</span>` : ''}
              </div>
            </div>
          `).join('')}</div>` : '<p class="text-sm text-gray-400 text-center py-6">No CAPI pixels configured. Add a pixel to start server-side tracking.</p>'}
        </div>
      </div>`;
  } catch { el.innerHTML = emptyState('CAPI Tracking', 'Configure Meta Conversions API for server-side event tracking.', 'fas fa-server'); }
}

function showConfigureCAPI() {
  openModal(`<div class="p-6"><h3 class="text-lg font-semibold mb-4"><i class="fas fa-server text-brand-500 mr-2"></i>Configure CAPI Pixel</h3>
    <form onsubmit="configureCAPI(event)" class="space-y-4">
      <div><label class="block text-sm font-medium mb-1">Pixel ID *</label><input id="capi-pixel" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g., 123456789" required></div>
      <div><label class="block text-sm font-medium mb-1">Ad Account ID *</label><input id="capi-account" class="w-full px-3 py-2 border rounded-lg text-sm" required></div>
      <p class="text-xs text-gray-400">Access token is inherited from your connected ad account.</p>
      <div class="flex gap-3 pt-2">
        <button type="submit" class="flex-1 py-2 btn-primary text-white rounded-lg text-sm font-medium">Configure</button>
        <button type="button" onclick="closeModal()" class="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
      </div>
    </form></div>`);
}

async function configureCAPI(e) {
  e.preventDefault();
  try {
    await api.post('/capi/configure', {
      pixel_id: document.getElementById('capi-pixel').value,
      ad_account_id: document.getElementById('capi-account').value,
    });
    closeModal(); renderCAPI();
  } catch(err) { alert(err.response?.data?.error?.message || 'Failed'); }
}
