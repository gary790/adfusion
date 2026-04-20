// ============================================
// AD FUSION — Complete Frontend SPA
// Dashboard, Campaigns, Ad Creator, AI, Automation, Billing
// ============================================

const AF = {
  state: {
    page: location.hash.replace('#','') || 'dashboard',
    user: null,
    token: localStorage.getItem('af_token'),
    refreshToken: localStorage.getItem('af_refresh'),
    workspaceId: localStorage.getItem('af_workspace'),
    workspaces: [],
    sidebarCollapsed: false,
    loading: false,
    notifications: [],
    unreadCount: 0,
  },
  charts: {},

  // ==============  API CLIENT  ==============
  async api(method, path, body) {
    const h = { 'Content-Type':'application/json' };
    if (this.state.token) h['Authorization'] = 'Bearer ' + this.state.token;
    if (this.state.workspaceId) h['X-Workspace-ID'] = this.state.workspaceId;
    try {
      const opts = { method, headers: h };
      if (body) opts.body = JSON.stringify(body);
      let r = await fetch('/api' + path, opts);
      if (r.status === 401) {
        const ok = await this.refreshAuth();
        if (!ok) { this.logout(); return null; }
        h['Authorization'] = 'Bearer ' + this.state.token;
        r = await fetch('/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      }
      return await r.json();
    } catch(e) { return { success:false, error:{ message:e.message } }; }
  },

  async refreshAuth() {
    if (!this.state.refreshToken) return false;
    try {
      const r = await fetch('/api/auth/refresh', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ refreshToken: this.state.refreshToken }),
      });
      const d = await r.json();
      if (d.success) {
        this.state.token = d.data.accessToken;
        this.state.refreshToken = d.data.refreshToken;
        localStorage.setItem('af_token', d.data.accessToken);
        localStorage.setItem('af_refresh', d.data.refreshToken);
        return true;
      }
    } catch(e) {}
    return false;
  },

  // ==============  AUTH  ==============
  logout() {
    this.state.token = this.state.refreshToken = this.state.user = this.state.workspaceId = null;
    ['af_token','af_refresh','af_workspace'].forEach(k => localStorage.removeItem(k));
    this.state.page = 'login';
    this.render();
  },

  navigate(page) {
    this.state.page = page;
    history.pushState({ page }, '', '#' + page);
    this.render();
  },

  toast(msg, type='success') {
    const el = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const txt = document.getElementById('toast-text');
    txt.textContent = msg;
    icon.className = type === 'success' ? 'fas fa-check-circle text-green-500 text-lg'
      : type === 'error' ? 'fas fa-exclamation-circle text-red-500 text-lg'
      : 'fas fa-info-circle text-blue-500 text-lg';
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  },

  // ==============  RENDER  ==============
  render() {
    const app = document.getElementById('app');
    if (!this.state.token) {
      app.innerHTML = this.renderAuth();
      this.bindAuth();
    } else {
      app.innerHTML = this.renderShell();
      this.bindShell();
      this.loadPage();
    }
  },

  // ==============  AUTH PAGE  ==============
  renderAuth() {
    const isLogin = this.state.page !== 'signup';
    return `
<div class="min-h-screen flex">
  <div class="hidden lg:flex lg:w-1/2 gradient-bg items-center justify-center p-12">
    <div class="max-w-lg text-white">
      <div class="flex items-center gap-3 mb-8">
        <div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
          <i class="fas fa-bolt text-2xl"></i>
        </div>
        <span class="text-3xl font-bold">Ad Fusion</span>
      </div>
      <h2 class="text-4xl font-extrabold leading-tight mb-6">AI-Powered Meta Advertising Platform</h2>
      <p class="text-white/80 text-lg leading-relaxed mb-8">Manage, optimize, and scale your Meta ad campaigns with real-time insights, AI copy generation, and automated rules.</p>
      <div class="space-y-4 text-white/90">
        <div class="flex items-center gap-3"><i class="fas fa-chart-line w-5 text-center"></i><span>Real-time campaign dashboards</span></div>
        <div class="flex items-center gap-3"><i class="fas fa-robot w-5 text-center"></i><span>GPT-4o powered ad copy &amp; optimization</span></div>
        <div class="flex items-center gap-3"><i class="fas fa-cogs w-5 text-center"></i><span>Automated rules &amp; budget management</span></div>
        <div class="flex items-center gap-3"><i class="fab fa-meta w-5 text-center"></i><span>Native Meta Marketing API integration</span></div>
        <div class="flex items-center gap-3"><i class="fas fa-credit-card w-5 text-center"></i><span>Stripe billing with usage tracking</span></div>
      </div>
    </div>
  </div>
  <div class="w-full lg:w-1/2 flex items-center justify-center p-8">
    <div class="w-full max-w-md">
      <div class="lg:hidden flex items-center gap-2 mb-8">
        <div class="w-10 h-10 gradient-brand rounded-xl flex items-center justify-center">
          <i class="fas fa-bolt text-white text-lg"></i>
        </div>
        <span class="text-2xl font-bold text-gray-800">Ad Fusion</span>
      </div>
      <h1 class="text-2xl font-bold mb-1">${isLogin ? 'Welcome back' : 'Create your account'}</h1>
      <p class="text-gray-500 mb-8">${isLogin ? 'Sign in to manage your campaigns' : 'Start optimizing your ads today'}</p>
      <form id="authForm" class="space-y-5">
        ${!isLogin ? '<div><label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label><input name="name" type="text" required class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="Jane Smith"></div>' : ''}
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input name="email" type="email" required class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="you@company.com">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input name="password" type="password" required minlength="8" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" placeholder="Min. 8 characters">
        </div>
        <button type="submit" class="w-full py-2.5 gradient-brand text-white rounded-xl font-semibold hover:opacity-90 transition">
          ${isLogin ? 'Sign In' : 'Create Account'}
        </button>
      </form>
      <div class="relative my-6"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-200"></div></div><div class="relative flex justify-center"><span class="bg-white px-4 text-sm text-gray-400">or continue with</span></div></div>
      <button id="metaLoginBtn" class="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition">
        <i class="fab fa-meta text-meta-blue"></i> Meta Business
      </button>
      <p class="text-center text-sm text-gray-500 mt-6">
        ${isLogin ? "Don't have an account?" : 'Already have an account?'}
        <a href="#" id="authToggle" class="text-brand-600 font-semibold hover:text-brand-700 ml-1">${isLogin ? 'Sign Up' : 'Sign In'}</a>
      </p>
      <p id="authError" class="text-red-500 text-sm text-center mt-3 hidden"></p>
    </div>
  </div>
</div>`;
  },

  bindAuth() {
    const form = document.getElementById('authForm');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const isLogin = this.state.page !== 'signup';
      const path = isLogin ? '/auth/login' : '/auth/signup';
      const body = {};
      fd.forEach((v,k) => body[k] = v);
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

      const res = await this.api('POST', path, body);
      btn.disabled = false; btn.textContent = isLogin ? 'Sign In' : 'Create Account';

      if (res?.success) {
        this.state.token = res.data.accessToken;
        this.state.refreshToken = res.data.refreshToken;
        this.state.user = res.data.user;
        localStorage.setItem('af_token', res.data.accessToken);
        localStorage.setItem('af_refresh', res.data.refreshToken);
        if (res.data.workspaces?.length) {
          this.state.workspaceId = res.data.workspaces[0].id;
          this.state.workspaces = res.data.workspaces;
          localStorage.setItem('af_workspace', res.data.workspaces[0].id);
        }
        this.state.page = 'dashboard';
        this.render();
      } else {
        const err = document.getElementById('authError');
        err.textContent = res?.error?.message || 'Authentication failed';
        err.classList.remove('hidden');
      }
    });

    document.getElementById('authToggle')?.addEventListener('click', e => {
      e.preventDefault();
      this.state.page = this.state.page === 'signup' ? 'login' : 'signup';
      this.render();
    });
  },

  // ==============  APP SHELL  ==============
  renderShell() {
    const collapsed = this.state.sidebarCollapsed;
    const w = collapsed ? 'w-16' : 'w-64';
    const pages = [
      { id:'dashboard', icon:'fa-chart-pie', label:'Dashboard' },
      { id:'campaigns', icon:'fa-bullhorn', label:'Campaigns' },
      { id:'adcreator', icon:'fa-paint-brush', label:'Ad Creator' },
      { id:'ai', icon:'fa-robot', label:'AI Studio' },
      { id:'automation', icon:'fa-cogs', label:'Automation' },
      { id:'billing', icon:'fa-credit-card', label:'Billing' },
      { id:'settings', icon:'fa-sliders-h', label:'Settings' },
    ];
    return `
<div class="flex h-screen overflow-hidden">
  <!-- Sidebar -->
  <aside class="${w} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 shrink-0">
    <div class="h-16 flex items-center ${collapsed ? 'justify-center' : 'px-5'} border-b border-gray-100">
      <div class="w-9 h-9 gradient-brand rounded-lg flex items-center justify-center shrink-0">
        <i class="fas fa-bolt text-white"></i>
      </div>
      ${collapsed ? '' : '<span class="ml-3 text-lg font-bold text-gray-800">Ad Fusion</span>'}
    </div>
    <nav class="flex-1 py-3 overflow-y-auto">
      ${pages.map(p => `
        <a href="#" data-page="${p.id}" class="sidebar-link flex items-center ${collapsed ? 'justify-center px-0 mx-2' : 'px-5'} py-2.5 text-sm text-gray-600 ${this.state.page === p.id ? 'active' : ''}">
          <i class="fas ${p.icon} ${collapsed ? '' : 'w-5 text-center mr-3'} text-[15px]"></i>
          ${collapsed ? '' : '<span>' + p.label + '</span>'}
        </a>`).join('')}
    </nav>
    <div class="p-3 border-t border-gray-100">
      <button id="toggleSidebar" class="w-full flex items-center justify-center py-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
        <i class="fas ${collapsed ? 'fa-chevron-right' : 'fa-chevron-left'}"></i>
      </button>
    </div>
  </aside>

  <!-- Main content -->
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Topbar -->
    <header class="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div class="flex items-center gap-4">
        <h1 id="pageTitle" class="text-lg font-semibold text-gray-800 capitalize">${this.state.page === 'adcreator' ? 'Ad Creator' : this.state.page === 'ai' ? 'AI Studio' : this.state.page}</h1>
      </div>
      <div class="flex items-center gap-4">
        <select id="workspaceSelect" class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-1 focus:ring-brand-500 outline-none">
          ${this.state.workspaces.map(w => `<option value="${w.id}" ${w.id === this.state.workspaceId ? 'selected' : ''}>${w.name}</option>`).join('')}
          ${this.state.workspaces.length === 0 ? '<option>Default Workspace</option>' : ''}
        </select>
        <button id="notifBtn" class="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
          <i class="fas fa-bell text-lg"></i>
          ${this.state.unreadCount > 0 ? `<span class="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">${this.state.unreadCount}</span>` : ''}
        </button>
        <div class="flex items-center gap-2 pl-3 border-l border-gray-200 cursor-pointer" id="userMenu">
          <div class="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-white text-sm font-semibold">
            ${(this.state.user?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <span class="text-sm font-medium text-gray-700 hidden sm:block">${this.state.user?.name || 'User'}</span>
          <i class="fas fa-chevron-down text-xs text-gray-400"></i>
        </div>
      </div>
    </header>

    <!-- Page Content -->
    <main id="pageContent" class="flex-1 overflow-y-auto p-6 bg-gray-50">
      <div class="flex items-center justify-center h-40"><i class="fas fa-spinner fa-spin text-2xl text-brand-500"></i></div>
    </main>
  </div>
</div>

<!-- User Dropdown (hidden) -->
<div id="userDropdown" class="hidden fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-2 w-48" style="top:60px;right:24px;">
  <a href="#" data-page="settings" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"><i class="fas fa-user mr-2 text-gray-400"></i>Profile</a>
  <a href="#" data-page="billing" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"><i class="fas fa-credit-card mr-2 text-gray-400"></i>Billing</a>
  <div class="border-t border-gray-100 my-1"></div>
  <a href="#" id="logoutBtn" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50"><i class="fas fa-sign-out-alt mr-2"></i>Sign Out</a>
</div>`;
  },

  bindShell() {
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('userDropdown')?.classList.add('hidden');
        this.navigate(el.dataset.page);
      });
    });
    document.getElementById('toggleSidebar')?.addEventListener('click', () => {
      this.state.sidebarCollapsed = !this.state.sidebarCollapsed;
      this.render();
    });
    document.getElementById('userMenu')?.addEventListener('click', () => {
      document.getElementById('userDropdown')?.classList.toggle('hidden');
    });
    document.getElementById('logoutBtn')?.addEventListener('click', e => { e.preventDefault(); this.logout(); });
    document.getElementById('workspaceSelect')?.addEventListener('change', e => {
      this.state.workspaceId = e.target.value;
      localStorage.setItem('af_workspace', e.target.value);
      this.loadPage();
    });
    // Close dropdown on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('#userMenu') && !e.target.closest('#userDropdown')) {
        document.getElementById('userDropdown')?.classList.add('hidden');
      }
    });
  },

  // ==============  PAGE ROUTER  ==============
  async loadPage() {
    const content = document.getElementById('pageContent');
    if (!content) return;
    // Destroy old charts
    Object.values(this.charts).forEach(c => c.destroy?.());
    this.charts = {};

    const page = this.state.page;
    switch(page) {
      case 'dashboard': await this.renderDashboard(content); break;
      case 'campaigns': await this.renderCampaigns(content); break;
      case 'adcreator': this.renderAdCreator(content); break;
      case 'ai': this.renderAIStudio(content); break;
      case 'automation': await this.renderAutomation(content); break;
      case 'billing': await this.renderBilling(content); break;
      case 'settings': this.renderSettings(content); break;
      default: content.innerHTML = '<p class="text-gray-500">Page not found.</p>';
    }
  },

  // ==============  HELPERS  ==============
  fmt(n, dec=0) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits:dec, maximumFractionDigits:dec }); },
  fmtCurrency(n) { return '$' + this.fmt(n, 2); },
  pctBadge(val) {
    if (!val || val === 0) return '<span class="text-gray-400 text-xs">—</span>';
    const up = val > 0;
    return `<span class="text-xs font-semibold ${up ? 'text-green-600' : 'text-red-600'}"><i class="fas fa-arrow-${up ? 'up' : 'down'} mr-0.5"></i>${Math.abs(val).toFixed(1)}%</span>`;
  },
  statusBadge(status) {
    const map = { ACTIVE:'bg-green-100 text-green-700', PAUSED:'bg-amber-100 text-amber-700', DELETED:'bg-red-100 text-red-700', ARCHIVED:'bg-gray-100 text-gray-600' };
    return `<span class="badge ${map[status] || 'bg-gray-100 text-gray-600'}">${status}</span>`;
  },
  skeleton(h='h-6',w='w-full') { return `<div class="skeleton rounded ${h} ${w}"></div>`; },

  // ==============  DASHBOARD  ==============
  async renderDashboard(el) {
    el.innerHTML = `
<div class="fade-in space-y-6">
  <!-- Metric Cards -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" id="metricCards">
    ${[1,2,3,4,5,6].map(() => `<div class="bg-white rounded-xl p-4 shadow-sm">${this.skeleton('h-20')}</div>`).join('')}
  </div>
  <!-- Charts Row -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 bg-white rounded-xl shadow-sm p-5">
      <h3 class="text-sm font-semibold text-gray-800 mb-4">Spend &amp; Performance Trend</h3>
      <canvas id="spendChart" height="250"></canvas>
    </div>
    <div class="bg-white rounded-xl shadow-sm p-5">
      <h3 class="text-sm font-semibold text-gray-800 mb-4">Campaign Status</h3>
      <canvas id="statusChart" height="250"></canvas>
    </div>
  </div>
  <!-- Top Campaigns -->
  <div class="bg-white rounded-xl shadow-sm p-5">
    <h3 class="text-sm font-semibold text-gray-800 mb-4">Top Campaigns (7d)</h3>
    <div id="topCampaigns" class="overflow-x-auto">${this.skeleton('h-40')}</div>
  </div>
  <!-- Top Ads -->
  <div class="bg-white rounded-xl shadow-sm p-5">
    <h3 class="text-sm font-semibold text-gray-800 mb-4">Top Ads by CTR (7d)</h3>
    <div id="topAds" class="overflow-x-auto">${this.skeleton('h-32')}</div>
  </div>
</div>`;

    // Fetch data
    const [summary, trend, topC, topA] = await Promise.all([
      this.api('GET', '/dashboard/summary'),
      this.api('GET', '/dashboard/spend-trend?days=30'),
      this.api('GET', '/dashboard/top-campaigns?sort_by=spend&limit=10'),
      this.api('GET', '/dashboard/top-ads?sort_by=ctr&limit=10'),
    ]);

    // Metric cards
    const mc = document.getElementById('metricCards');
    if (summary?.success) {
      const m = summary.data.metrics;
      const cards = [
        { label:'Spend', value: this.fmtCurrency(m.spend.value), change:m.spend.change, color:'purple', icon:'fa-dollar-sign' },
        { label:'Impressions', value: this.fmt(m.impressions.value), change:m.impressions.change, color:'blue', icon:'fa-eye' },
        { label:'Clicks', value: this.fmt(m.clicks.value), change:m.clicks.change, color:'green', icon:'fa-mouse-pointer' },
        { label:'CTR', value: this.fmt(m.ctr.value, 2) + '%', change:m.ctr.change, color:'amber', icon:'fa-percent' },
        { label:'CPC', value: this.fmtCurrency(m.cpc.value), change:m.cpc.change, color:'red', icon:'fa-hand-holding-usd' },
        { label:'CPM', value: this.fmtCurrency(m.cpm.value), change:m.cpm.change, color:'indigo', icon:'fa-chart-bar' },
      ];
      mc.innerHTML = cards.map(c => `
        <div class="metric-card ${c.color} bg-white rounded-xl p-4 shadow-sm card-hover">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">${c.label}</span>
            <i class="fas ${c.icon} text-gray-300"></i>
          </div>
          <div class="text-xl font-bold text-gray-800">${c.value}</div>
          <div class="mt-1">${this.pctBadge(c.change)}</div>
        </div>`).join('');
    }

    // Spend chart
    if (trend?.success && trend.data.length) {
      const ctx = document.getElementById('spendChart')?.getContext('2d');
      if (ctx) {
        this.charts.spend = new Chart(ctx, {
          type:'line',
          data: {
            labels: trend.data.map(d => new Date(d.date).toLocaleDateString('en-US', {month:'short', day:'numeric'})),
            datasets: [
              { label:'Spend ($)', data: trend.data.map(d => Number(d.spend)), borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.08)', fill:true, tension:0.3, pointRadius:2 },
              { label:'Clicks', data: trend.data.map(d => Number(d.clicks)), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,0.08)', fill:true, tension:0.3, yAxisID:'y1', pointRadius:2 },
            ],
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            interaction:{ mode:'index', intersect:false },
            scales: {
              y: { beginAtZero:true, grid:{ color:'#f1f5f9' } },
              y1: { position:'right', beginAtZero:true, grid:{ display:false } },
              x: { grid:{ display:false } },
            },
            plugins: { legend:{ position:'top', labels:{ boxWidth:12, padding:16, font:{size:12} } } },
          },
        });
      }
    }

    // Status chart
    if (summary?.success && summary.data.campaign_breakdown) {
      const br = summary.data.campaign_breakdown;
      const ctx2 = document.getElementById('statusChart')?.getContext('2d');
      if (ctx2) {
        const labels = Object.keys(br);
        const values = Object.values(br);
        this.charts.status = new Chart(ctx2, {
          type:'doughnut',
          data: {
            labels,
            datasets: [{ data:values, backgroundColor:['#22c55e','#f59e0b','#ef4444','#94a3b8'], borderWidth:0 }],
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            cutout:'65%',
            plugins: { legend:{ position:'bottom', labels:{ boxWidth:12, padding:12, font:{size:11} } } },
          },
        });
      }
    }

    // Top Campaigns table
    const topCEl = document.getElementById('topCampaigns');
    if (topC?.success && topC.data.length) {
      topCEl.innerHTML = `
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
          <th class="pb-3 font-medium">Campaign</th><th class="pb-3 font-medium">Status</th><th class="pb-3 font-medium text-right">Spend</th><th class="pb-3 font-medium text-right">Impr.</th><th class="pb-3 font-medium text-right">Clicks</th><th class="pb-3 font-medium text-right">CTR</th><th class="pb-3 font-medium text-right">CPC</th>
        </tr></thead>
        <tbody>
          ${topC.data.map(c => `<tr class="border-b border-gray-50 hover:bg-gray-50">
            <td class="py-2.5 font-medium text-gray-800 max-w-[200px] truncate">${c.name}</td>
            <td class="py-2.5">${this.statusBadge(c.status)}</td>
            <td class="py-2.5 text-right">${this.fmtCurrency(c.spend)}</td>
            <td class="py-2.5 text-right text-gray-600">${this.fmt(c.impressions)}</td>
            <td class="py-2.5 text-right text-gray-600">${this.fmt(c.clicks)}</td>
            <td class="py-2.5 text-right font-medium">${Number(c.ctr).toFixed(2)}%</td>
            <td class="py-2.5 text-right">${this.fmtCurrency(c.cpc)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    } else {
      topCEl.innerHTML = '<p class="text-gray-400 text-sm py-4 text-center">No campaign data yet. Connect a Meta ad account to get started.</p>';
    }

    // Top Ads table
    const topAEl = document.getElementById('topAds');
    if (topA?.success && topA.data.length) {
      topAEl.innerHTML = `
      <table class="w-full text-sm">
        <thead><tr class="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-gray-100">
          <th class="pb-3 font-medium">Ad</th><th class="pb-3 font-medium">Campaign</th><th class="pb-3 font-medium text-right">CTR</th><th class="pb-3 font-medium text-right">CPC</th><th class="pb-3 font-medium text-right">Spend</th>
        </tr></thead>
        <tbody>
          ${topA.data.map(a => `<tr class="border-b border-gray-50 hover:bg-gray-50">
            <td class="py-2.5 font-medium text-gray-800 max-w-[180px] truncate">${a.name}</td>
            <td class="py-2.5 text-gray-500 max-w-[160px] truncate">${a.campaign_name}</td>
            <td class="py-2.5 text-right font-semibold text-brand-600">${Number(a.ctr).toFixed(2)}%</td>
            <td class="py-2.5 text-right">${this.fmtCurrency(a.cpc)}</td>
            <td class="py-2.5 text-right">${this.fmtCurrency(a.spend)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    } else {
      topAEl.innerHTML = '<p class="text-gray-400 text-sm py-4 text-center">No ad performance data available.</p>';
    }
  },

  // ==============  CAMPAIGNS  ==============
  async renderCampaigns(el) {
    el.innerHTML = `
<div class="fade-in space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <select id="campaignStatusFilter" class="text-sm border rounded-lg px-3 py-2 bg-white">
        <option value="">All Status</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option>
      </select>
      <div class="relative">
        <i class="fas fa-search absolute left-3 top-2.5 text-gray-400 text-sm"></i>
        <input id="campaignSearch" type="text" placeholder="Search campaigns..." class="pl-9 pr-4 py-2 text-sm border rounded-lg bg-white focus:ring-1 focus:ring-brand-500 outline-none w-64">
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button id="syncAllBtn" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"><i class="fas fa-sync mr-1.5"></i>Sync All</button>
      <button id="newCampaignBtn" class="px-4 py-2 text-sm gradient-brand text-white rounded-lg font-medium hover:opacity-90"><i class="fas fa-plus mr-1.5"></i>New Campaign</button>
    </div>
  </div>
  <div id="campaignList" class="bg-white rounded-xl shadow-sm overflow-hidden">${this.skeleton('h-60')}</div>
</div>

<!-- Campaign Detail Modal -->
<div id="campaignModal" class="hidden fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto p-6" id="campaignModalContent"></div>
</div>`;

    await this.loadCampaignList();

    document.getElementById('campaignStatusFilter')?.addEventListener('change', () => this.loadCampaignList());
    document.getElementById('campaignSearch')?.addEventListener('input', this.debounce(() => this.loadCampaignList(), 400));
    document.getElementById('syncAllBtn')?.addEventListener('click', async () => {
      this.toast('Syncing all accounts...', 'info');
      const res = await this.api('POST', '/campaigns/sync-all');
      if (res?.success) this.toast('Sync complete!');
      else this.toast('Sync failed', 'error');
    });
    document.getElementById('campaignModal')?.addEventListener('click', e => {
      if (e.target.id === 'campaignModal') e.target.classList.add('hidden');
    });
  },

  async loadCampaignList() {
    const status = document.getElementById('campaignStatusFilter')?.value || '';
    const search = document.getElementById('campaignSearch')?.value || '';
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (search) qs.set('search', search);

    const res = await this.api('GET', '/campaigns?' + qs.toString());
    const el = document.getElementById('campaignList');
    if (!el) return;

    if (res?.success && res.data.campaigns?.length) {
      el.innerHTML = `
      <table class="w-full text-sm">
        <thead><tr class="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wider">
          <th class="px-5 py-3 font-medium">Campaign</th><th class="px-3 py-3 font-medium">Status</th><th class="px-3 py-3 font-medium">Objective</th><th class="px-3 py-3 font-medium text-right">Budget/Day</th><th class="px-3 py-3 font-medium text-right">Spend (7d)</th><th class="px-3 py-3 font-medium text-right">CTR</th><th class="px-3 py-3 font-medium text-right">CPC</th><th class="px-3 py-3 font-medium">Actions</th>
        </tr></thead>
        <tbody>
          ${res.data.campaigns.map(c => {
            const m = c.metrics_7d || {};
            return `<tr class="border-t border-gray-50 hover:bg-gray-50 cursor-pointer campaign-row" data-id="${c.id}">
              <td class="px-5 py-3 font-medium text-gray-800">${c.name}</td>
              <td class="px-3 py-3">${this.statusBadge(c.status)}</td>
              <td class="px-3 py-3 text-gray-500 text-xs">${(c.objective || '').replace('OUTCOME_','')}</td>
              <td class="px-3 py-3 text-right">${c.daily_budget ? this.fmtCurrency(c.daily_budget) : '—'}</td>
              <td class="px-3 py-3 text-right">${this.fmtCurrency(m.spend)}</td>
              <td class="px-3 py-3 text-right font-medium">${m.ctr ? Number(m.ctr).toFixed(2) + '%' : '—'}</td>
              <td class="px-3 py-3 text-right">${m.cpc ? this.fmtCurrency(m.cpc) : '—'}</td>
              <td class="px-3 py-3">
                <button class="text-gray-400 hover:text-brand-600 campaign-analyze" data-id="${c.id}" title="AI Analyze"><i class="fas fa-robot"></i></button>
                <button class="text-gray-400 hover:text-blue-600 ml-2 campaign-sync" data-id="${c.id}" title="Sync"><i class="fas fa-sync-alt"></i></button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

      el.querySelectorAll('.campaign-row').forEach(row => {
        row.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          this.showCampaignDetail(row.dataset.id);
        });
      });
      el.querySelectorAll('.campaign-analyze').forEach(btn => {
        btn.addEventListener('click', async () => {
          this.toast('Running AI analysis...', 'info');
          const res = await this.api('POST', '/ai/analyze-campaign', { campaign_id: btn.dataset.id });
          if (res?.success) {
            this.toast('Analysis complete!');
            this.showAIResult(res.data);
          } else this.toast('Analysis failed', 'error');
        });
      });
      el.querySelectorAll('.campaign-sync').forEach(btn => {
        btn.addEventListener('click', async () => {
          this.toast('Syncing...', 'info');
          const res = await this.api('POST', `/campaigns/${btn.dataset.id}/sync`);
          if (res?.success) { this.toast('Sync done!'); this.loadCampaignList(); }
          else this.toast('Sync failed', 'error');
        });
      });
    } else {
      el.innerHTML = `<div class="text-center py-12 text-gray-400">
        <i class="fas fa-bullhorn text-4xl mb-3 text-gray-300"></i>
        <p class="text-sm">No campaigns found. Connect a Meta ad account first.</p>
      </div>`;
    }
  },

  async showCampaignDetail(id) {
    const modal = document.getElementById('campaignModal');
    const content = document.getElementById('campaignModalContent');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="flex justify-center py-12"><i class="fas fa-spinner fa-spin text-2xl text-brand-500"></i></div>';

    const res = await this.api('GET', '/campaigns/' + id);
    if (!res?.success) { content.innerHTML = '<p class="text-red-500">Failed to load campaign.</p>'; return; }
    const c = res.data.campaign;
    const perf = res.data.performance_trend || [];

    content.innerHTML = `
      <div class="flex items-center justify-between mb-5">
        <div>
          <h2 class="text-lg font-bold text-gray-800">${c.name}</h2>
          <p class="text-sm text-gray-500">${(c.objective || '').replace('OUTCOME_','')} &middot; ${this.statusBadge(c.status)}</p>
        </div>
        <button onclick="document.getElementById('campaignModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
      </div>
      <div class="grid grid-cols-4 gap-4 mb-5">
        <div class="bg-gray-50 rounded-lg p-3 text-center"><div class="text-xs text-gray-500">Budget/Day</div><div class="font-bold">${c.daily_budget ? this.fmtCurrency(c.daily_budget) : '—'}</div></div>
        <div class="bg-gray-50 rounded-lg p-3 text-center"><div class="text-xs text-gray-500">Bid Strategy</div><div class="font-semibold text-sm">${(c.bid_strategy || '').replace(/_/g,' ')}</div></div>
        <div class="bg-gray-50 rounded-lg p-3 text-center"><div class="text-xs text-gray-500">Ad Sets</div><div class="font-bold">${res.data.adsets?.length || 0}</div></div>
        <div class="bg-gray-50 rounded-lg p-3 text-center"><div class="text-xs text-gray-500">Last Sync</div><div class="font-semibold text-xs">${c.last_synced_at ? new Date(c.last_synced_at).toLocaleString() : 'Never'}</div></div>
      </div>
      ${perf.length ? `<div class="mb-4"><canvas id="campaignTrendChart" height="200"></canvas></div>` : ''}
      ${res.data.adsets?.length ? `
        <h3 class="text-sm font-semibold mb-2">Ad Sets</h3>
        <div class="space-y-2">${res.data.adsets.map(as => `
          <div class="border rounded-lg p-3 text-sm flex items-center justify-between">
            <div><span class="font-medium">${as.name}</span> ${this.statusBadge(as.status)}</div>
            <div class="text-gray-500">${as.daily_budget ? this.fmtCurrency(as.daily_budget) + '/day' : ''}</div>
          </div>`).join('')}
        </div>` : ''}
    `;

    if (perf.length) {
      const ctx = document.getElementById('campaignTrendChart')?.getContext('2d');
      if (ctx) {
        new Chart(ctx, {
          type:'line',
          data: {
            labels: perf.map(d => new Date(d.date_start).toLocaleDateString('en-US', {month:'short',day:'numeric'})),
            datasets: [
              { label:'Spend', data:perf.map(d => Number(d.spend)), borderColor:'#6366f1', tension:0.3, pointRadius:1 },
              { label:'CTR %', data:perf.map(d => Number(d.ctr)), borderColor:'#22c55e', tension:0.3, yAxisID:'y1', pointRadius:1 },
            ],
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            scales: { y:{beginAtZero:true,grid:{color:'#f1f5f9'}}, y1:{position:'right',beginAtZero:true,grid:{display:false}}, x:{grid:{display:false}} },
            plugins:{legend:{position:'top',labels:{boxWidth:10,font:{size:11}}}},
          },
        });
      }
    }
  },

  showAIResult(data) {
    const modal = document.getElementById('campaignModal');
    const content = document.getElementById('campaignModalContent');
    modal?.classList.remove('hidden');
    content.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold"><i class="fas fa-robot text-brand-500 mr-2"></i>AI Analysis Results</h2>
        <button onclick="document.getElementById('campaignModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>
      </div>
      ${data.summary ? `<div class="bg-brand-50 border border-brand-100 rounded-lg p-4 mb-4 text-sm text-brand-800">${data.summary}</div>` : ''}
      ${data.findings?.length ? `
        <h3 class="text-sm font-semibold mb-2">Findings</h3>
        <div class="space-y-2 mb-4">${data.findings.map(f => `
          <div class="border-l-4 ${f.severity === 'critical' ? 'border-red-500 bg-red-50' : f.severity === 'warning' ? 'border-amber-500 bg-amber-50' : 'border-blue-500 bg-blue-50'} rounded p-3 text-sm">
            <div class="font-semibold">${f.category?.replace(/_/g,' ')}</div>
            <div class="text-gray-700 mt-1">${f.message}</div>
          </div>`).join('')}
        </div>` : ''}
      ${data.recommendations?.length ? `
        <h3 class="text-sm font-semibold mb-2">Recommendations</h3>
        <div class="space-y-2">${data.recommendations.map(r => `
          <div class="bg-gray-50 rounded-lg p-3 text-sm">
            <div class="flex items-center gap-2 mb-1">
              <span class="badge ${r.priority === 'high' ? 'bg-red-100 text-red-700' : r.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}">${r.priority}</span>
              <span class="font-semibold">${r.title}</span>
            </div>
            <p class="text-gray-600">${r.description}</p>
            ${r.estimated_impact ? `<p class="text-xs text-brand-600 mt-1"><i class="fas fa-chart-line mr-1"></i>${r.estimated_impact}</p>` : ''}
          </div>`).join('')}
        </div>` : ''}
    `;
  },

  // ==============  AD CREATOR  ==============
  renderAdCreator(el) {
    el.innerHTML = `
<div class="fade-in grid grid-cols-1 lg:grid-cols-2 gap-6">
  <!-- Form -->
  <div class="bg-white rounded-xl shadow-sm p-6">
    <h2 class="text-lg font-bold mb-4"><i class="fas fa-paint-brush text-brand-500 mr-2"></i>AI Ad Copy Generator</h2>
    <form id="copyForm" class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Product / Service Name</label>
        <input name="product_name" required class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-brand-500 outline-none" placeholder="e.g. Acme CRM Pro">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea name="product_description" rows="3" required class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-brand-500 outline-none resize-none" placeholder="Describe your product or service in detail..."></textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
          <input name="target_audience" required class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-brand-500 outline-none" placeholder="e.g. SaaS founders 25-45">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tone</label>
          <select name="tone" class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
            ${['professional','casual','urgent','emotional','humorous','authoritative','inspirational','conversational','provocative'].map(t => `<option value="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Objective</label>
          <select name="objective" class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
            ${['OUTCOME_AWARENESS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_LEADS','OUTCOME_APP_PROMOTION','OUTCOME_SALES'].map(o => `<option value="${o}">${o.replace('OUTCOME_','')}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Variations</label>
          <select name="variations_count" class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
            <option value="3">3 variations</option><option value="5">5 variations</option><option value="8">8 variations</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Key Benefits (one per line, optional)</label>
        <textarea name="key_benefits" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-brand-500 outline-none resize-none" placeholder="Saves 10 hours/week&#10;3x more conversions"></textarea>
      </div>
      <button type="submit" class="w-full py-2.5 gradient-brand text-white rounded-lg font-semibold hover:opacity-90 transition">
        <i class="fas fa-magic mr-2"></i>Generate Ad Copy
      </button>
    </form>
  </div>

  <!-- Results -->
  <div>
    <div id="copyResults" class="space-y-4">
      <div class="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 py-16">
        <i class="fas fa-wand-magic-sparkles text-5xl mb-4 text-gray-200"></i>
        <p class="text-sm">Fill in the form and click Generate to create AI-powered ad copy variations.</p>
      </div>
    </div>
  </div>
</div>`;

    document.getElementById('copyForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {};
      fd.forEach((v,k) => { if (v) body[k] = k === 'key_benefits' ? v.split('\n').filter(Boolean) : (k === 'variations_count' ? parseInt(v) : v); });

      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';

      const res = await this.api('POST', '/ai/generate-copy', body);
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate Ad Copy';

      const results = document.getElementById('copyResults');
      if (res?.success && res.data.copies?.length) {
        results.innerHTML = res.data.copies.map((c, i) => `
          <div class="bg-white rounded-xl shadow-sm p-5 card-hover fade-in" style="animation-delay:${i*80}ms">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <span class="badge bg-brand-100 text-brand-700">${c.framework_used || 'Mixed'}</span>
                <span class="badge ${c.score >= 85 ? 'bg-green-100 text-green-700' : c.score >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}">${c.score}/100</span>
              </div>
              <button class="text-gray-400 hover:text-brand-600 copy-btn" data-text="${encodeURIComponent(c.primary_text)}" title="Copy"><i class="fas fa-copy"></i></button>
            </div>
            <div class="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-100">
              <div class="text-xs text-gray-500 mb-1 font-medium uppercase">Headline</div>
              <div class="font-bold text-gray-800">${c.headline}</div>
              <div class="text-xs text-gray-500 mt-3 mb-1 font-medium uppercase">Primary Text</div>
              <div class="text-sm text-gray-700 whitespace-pre-wrap">${c.primary_text}</div>
              ${c.description ? `<div class="text-xs text-gray-500 mt-3 mb-1 font-medium uppercase">Description</div><div class="text-sm text-gray-600">${c.description}</div>` : ''}
              <div class="mt-3 flex items-center gap-2">
                <span class="badge bg-blue-100 text-blue-700">${c.call_to_action || 'LEARN_MORE'}</span>
              </div>
            </div>
            ${c.hooks?.length ? `<div class="text-xs text-gray-500"><span class="font-medium">Hooks:</span> ${c.hooks.join(' &middot; ')}</div>` : ''}
            ${c.reasoning ? `<p class="text-xs text-gray-400 mt-2 italic">${c.reasoning}</p>` : ''}
          </div>`).join('');

        results.querySelectorAll('.copy-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            navigator.clipboard?.writeText(decodeURIComponent(btn.dataset.text));
            this.toast('Copied to clipboard!');
          });
        });
      } else {
        results.innerHTML = '<div class="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700"><i class="fas fa-exclamation-circle mr-2"></i>Generation failed. Check your OpenAI API key configuration.</div>';
      }
    });
  },

  // ==============  AI STUDIO  ==============
  renderAIStudio(el) {
    el.innerHTML = `
<div class="fade-in space-y-6">
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    ${[
      { id:'headline', icon:'fa-heading', title:'Headline Generator', desc:'Generate high-converting Meta ad headlines', color:'purple' },
      { id:'fatigue', icon:'fa-heartbeat', title:'Creative Fatigue Detector', desc:'Check if your ad creative is getting stale', color:'red' },
      { id:'scaling', icon:'fa-chart-line', title:'Scaling Readiness', desc:'Check if your campaign is ready to scale', color:'green' },
      { id:'audience', icon:'fa-users', title:'Audience Recommender', desc:'AI-powered audience targeting suggestions', color:'blue' },
      { id:'budget', icon:'fa-calculator', title:'Budget Optimizer', desc:'Optimal budget allocation across campaigns', color:'amber' },
      { id:'history', icon:'fa-history', title:'Analysis History', desc:'View past AI analyses and recommendations', color:'gray' },
    ].map(t => `
      <div class="bg-white rounded-xl shadow-sm p-5 card-hover cursor-pointer ai-tool-card" data-tool="${t.id}">
        <div class="w-10 h-10 rounded-xl bg-${t.color}-100 flex items-center justify-center mb-3">
          <i class="fas ${t.icon} text-${t.color}-600"></i>
        </div>
        <h3 class="font-semibold text-gray-800 mb-1">${t.title}</h3>
        <p class="text-sm text-gray-500">${t.desc}</p>
      </div>`).join('')}
  </div>
  <div id="aiToolPanel" class="bg-white rounded-xl shadow-sm p-6 hidden"></div>
</div>`;

    el.querySelectorAll('.ai-tool-card').forEach(card => {
      card.addEventListener('click', () => this.showAITool(card.dataset.tool));
    });
  },

  showAITool(tool) {
    const panel = document.getElementById('aiToolPanel');
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior:'smooth' });

    const tools = {
      headline: `
        <h3 class="text-lg font-bold mb-4"><i class="fas fa-heading text-purple-500 mr-2"></i>Headline Generator</h3>
        <form id="headlineForm" class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Product Info</label><input name="product_info" required class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Brief product description"></div>
          <div><label class="block text-sm font-medium mb-1">Target Audience</label><input name="target_audience" required class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Who are you targeting?"></div>
          <div><label class="block text-sm font-medium mb-1">Number of Headlines</label><select name="count" class="px-3 py-2 border rounded-lg text-sm bg-white"><option value="5">5</option><option value="10" selected>10</option><option value="20">20</option></select></div>
          <button type="submit" class="px-6 py-2 gradient-brand text-white rounded-lg font-semibold text-sm"><i class="fas fa-magic mr-2"></i>Generate Headlines</button>
        </form>
        <div id="headlineResults" class="mt-4"></div>`,
      fatigue: `
        <h3 class="text-lg font-bold mb-4"><i class="fas fa-heartbeat text-red-500 mr-2"></i>Creative Fatigue Detector</h3>
        <form id="fatigueForm" class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Ad ID</label><input name="ad_id" required class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Enter the ad UUID"></div>
          <button type="submit" class="px-6 py-2 gradient-brand text-white rounded-lg font-semibold text-sm"><i class="fas fa-stethoscope mr-2"></i>Check Fatigue</button>
        </form>
        <div id="fatigueResults" class="mt-4"></div>`,
      scaling: `
        <h3 class="text-lg font-bold mb-4"><i class="fas fa-chart-line text-green-500 mr-2"></i>Scaling Readiness</h3>
        <form id="scalingForm" class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Campaign ID</label><input name="campaign_id" required class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Enter the campaign UUID"></div>
          <button type="submit" class="px-6 py-2 gradient-brand text-white rounded-lg font-semibold text-sm"><i class="fas fa-tachometer-alt mr-2"></i>Check Readiness</button>
        </form>
        <div id="scalingResults" class="mt-4"></div>`,
      audience: `
        <h3 class="text-lg font-bold mb-4"><i class="fas fa-users text-blue-500 mr-2"></i>Audience Recommender</h3>
        <form id="audienceForm" class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Product Info</label><textarea name="product_info" rows="2" required class="w-full px-3 py-2 border rounded-lg text-sm resize-none" placeholder="Describe your product/service"></textarea></div>
          <div><label class="block text-sm font-medium mb-1">Campaign ID (optional)</label><input name="campaign_id" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="For performance-based recommendations"></div>
          <button type="submit" class="px-6 py-2 gradient-brand text-white rounded-lg font-semibold text-sm"><i class="fas fa-crosshairs mr-2"></i>Get Recommendations</button>
        </form>
        <div id="audienceResults" class="mt-4"></div>`,
      budget: `
        <h3 class="text-lg font-bold mb-4"><i class="fas fa-calculator text-amber-500 mr-2"></i>Budget Optimizer</h3>
        <form id="budgetForm" class="space-y-4">
          <div><label class="block text-sm font-medium mb-1">Total Daily Budget ($)</label><input name="total_budget" type="number" step="0.01" min="1" required class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. 500"></div>
          <button type="submit" class="px-6 py-2 gradient-brand text-white rounded-lg font-semibold text-sm"><i class="fas fa-balance-scale mr-2"></i>Optimize Budget</button>
        </form>
        <div id="budgetResults" class="mt-4"></div>`,
      history: `
        <h3 class="text-lg font-bold mb-4"><i class="fas fa-history text-gray-500 mr-2"></i>Analysis History</h3>
        <div id="historyResults">${this.skeleton('h-32')}</div>`,
    };

    panel.innerHTML = tools[tool] || '<p>Tool not found</p>';

    // Bind forms
    document.getElementById('headlineForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
      const res = await this.api('POST', '/ai/generate-headlines', { product_info:fd.get('product_info'), target_audience:fd.get('target_audience'), count:parseInt(fd.get('count')) });
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate Headlines';
      const el = document.getElementById('headlineResults');
      if (res?.success) {
        el.innerHTML = `<div class="space-y-2">${(res.data.headlines || []).map(h => `
          <div class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
            <div class="flex-1"><span class="font-medium text-sm">${h.headline}</span> <span class="badge bg-gray-100 text-gray-600 ml-2">${h.hook_type}</span></div>
            <span class="text-xs font-bold ${h.score >= 80 ? 'text-green-600' : 'text-amber-600'}">${h.score}</span>
          </div>`).join('')}</div>`;
      } else el.innerHTML = '<p class="text-red-500 text-sm">Generation failed.</p>';
    });

    document.getElementById('fatigueForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Checking...';
      const res = await this.api('POST', '/ai/creative-fatigue', { ad_id:fd.get('ad_id') });
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-stethoscope mr-2"></i>Check Fatigue';
      const el = document.getElementById('fatigueResults');
      if (res?.success) {
        const d = res.data;
        el.innerHTML = `
          <div class="p-4 rounded-lg ${d.is_fatigued ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}">
            <div class="flex items-center gap-3 mb-2">
              <div class="text-2xl font-bold ${d.is_fatigued ? 'text-red-600' : 'text-green-600'}">${d.fatigue_score}/100</div>
              <span class="font-semibold ${d.is_fatigued ? 'text-red-700' : 'text-green-700'}">${d.is_fatigued ? 'FATIGUED' : 'HEALTHY'}</span>
            </div>
            <p class="text-sm text-gray-700 mb-2">${d.recommendation}</p>
            ${d.signals?.length ? `<ul class="text-xs text-gray-600 space-y-1">${d.signals.map(s => `<li><i class="fas fa-exclamation-triangle text-amber-500 mr-1"></i>${s}</li>`).join('')}</ul>` : ''}
          </div>`;
      } else el.innerHTML = '<p class="text-red-500 text-sm">Check failed.</p>';
    });

    document.getElementById('scalingForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Checking...';
      const res = await this.api('POST', '/ai/scaling-readiness', { campaign_id:fd.get('campaign_id') });
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-tachometer-alt mr-2"></i>Check Readiness';
      const el = document.getElementById('scalingResults');
      if (res?.success) {
        const d = res.data;
        el.innerHTML = `
          <div class="p-4 rounded-lg ${d.ready_to_scale ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}">
            <div class="flex items-center gap-3 mb-2">
              <div class="text-2xl font-bold">${d.score}/100</div>
              <span class="font-semibold ${d.ready_to_scale ? 'text-green-700' : 'text-amber-700'}">${d.ready_to_scale ? 'READY TO SCALE' : 'NOT READY'}</span>
            </div>
            <p class="text-sm text-gray-700 mb-2">${d.strategy}</p>
            ${d.recommended_budget ? `<p class="text-sm font-medium">Recommended budget: $${d.recommended_budget.toFixed(2)}/day</p>` : ''}
            ${d.blockers?.length ? `<div class="mt-2"><p class="text-xs font-medium text-gray-600">Blockers:</p><ul class="text-xs text-gray-600 space-y-1">${d.blockers.map(b => `<li class="text-red-600"><i class="fas fa-times-circle mr-1"></i>${b}</li>`).join('')}</ul></div>` : ''}
          </div>`;
      } else el.innerHTML = '<p class="text-red-500 text-sm">Check failed.</p>';
    });

    document.getElementById('audienceForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing...';
      const res = await this.api('POST', '/ai/recommend-audiences', { product_info:fd.get('product_info'), campaign_id:fd.get('campaign_id') || undefined });
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-crosshairs mr-2"></i>Get Recommendations';
      const el = document.getElementById('audienceResults');
      if (res?.success) this.showAIResult(res.data);
      else el.innerHTML = '<p class="text-red-500 text-sm">Recommendation failed.</p>';
    });

    document.getElementById('budgetForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Optimizing...';
      const res = await this.api('POST', '/ai/optimize-budget', { total_budget:parseFloat(fd.get('total_budget')) });
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-balance-scale mr-2"></i>Optimize Budget';
      const el = document.getElementById('budgetResults');
      if (res?.success) this.showAIResult(res.data);
      else el.innerHTML = '<p class="text-red-500 text-sm">Optimization failed.</p>';
    });

    if (tool === 'history') this.loadAIHistory();
  },

  async loadAIHistory() {
    const res = await this.api('GET', '/ai/history?limit=20');
    const el = document.getElementById('historyResults');
    if (!el) return;
    if (res?.success && res.data.length) {
      el.innerHTML = `<div class="space-y-2">${res.data.map(h => `
        <div class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 text-sm">
          <div>
            <span class="font-medium">${h.analysis_type.replace(/_/g,' ')}</span>
            <span class="text-gray-400 text-xs ml-2">${h.target_type}:${h.target_id?.substring(0,8)}...</span>
          </div>
          <div class="flex items-center gap-3 text-xs text-gray-500">
            <span>${h.model_used}</span>
            <span>${h.tokens_used} tokens</span>
            <span>${new Date(h.created_at).toLocaleDateString()}</span>
          </div>
        </div>`).join('')}</div>`;
    } else el.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No analysis history yet.</p>';
  },

  // ==============  AUTOMATION  ==============
  async renderAutomation(el) {
    el.innerHTML = `
<div class="fade-in space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-bold">Automation Rules</h2>
    <div class="flex gap-2">
      <button id="showPresetsBtn" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"><i class="fas fa-magic mr-1.5"></i>Presets</button>
      <button id="newRuleBtn" class="px-4 py-2 text-sm gradient-brand text-white rounded-lg font-medium hover:opacity-90"><i class="fas fa-plus mr-1.5"></i>New Rule</button>
    </div>
  </div>
  <div id="rulesList">${this.skeleton('h-40')}</div>
  <div id="executionHistory" class="bg-white rounded-xl shadow-sm p-5">
    <h3 class="text-sm font-semibold text-gray-800 mb-3">Recent Executions</h3>
    <div id="execList">${this.skeleton('h-20')}</div>
  </div>
</div>

<!-- Rule Modal -->
<div id="ruleModal" class="hidden fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6" id="ruleModalContent"></div>
</div>`;

    await this.loadRules();
    await this.loadExecutions();

    document.getElementById('showPresetsBtn')?.addEventListener('click', () => this.showPresets());
    document.getElementById('newRuleBtn')?.addEventListener('click', () => this.showRuleForm());
    document.getElementById('ruleModal')?.addEventListener('click', e => {
      if (e.target.id === 'ruleModal') e.target.classList.add('hidden');
    });
  },

  async loadRules() {
    const res = await this.api('GET', '/automation/rules');
    const el = document.getElementById('rulesList');
    if (!el) return;
    if (res?.success && res.data.length) {
      el.innerHTML = `<div class="space-y-3">${res.data.map(r => `
        <div class="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between card-hover">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-gray-800">${r.name}</span>
              <span class="badge ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">${r.is_active ? 'Active' : 'Paused'}</span>
              <span class="badge bg-blue-100 text-blue-700">${r.scope}</span>
            </div>
            <p class="text-sm text-gray-500">${r.description || 'No description'}</p>
            <div class="flex items-center gap-4 mt-1 text-xs text-gray-400">
              <span><i class="fas fa-play mr-1"></i>${r.execution_count || 0} runs</span>
              <span><i class="fas fa-clock mr-1"></i>${r.last_execution ? new Date(r.last_execution).toLocaleDateString() : 'Never'}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 ml-4">
            <button class="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 font-medium rule-run" data-id="${r.id}"><i class="fas fa-play mr-1"></i>Run</button>
            <button class="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 font-medium rule-delete" data-id="${r.id}"><i class="fas fa-trash mr-1"></i></button>
          </div>
        </div>`).join('')}</div>`;

      el.querySelectorAll('.rule-run').forEach(btn => {
        btn.addEventListener('click', async () => {
          this.toast('Running rule...', 'info');
          const res = await this.api('POST', `/automation/rules/${btn.dataset.id}/run`);
          if (res?.success) { this.toast(res.data.message); this.loadExecutions(); }
          else this.toast('Rule execution failed', 'error');
        });
      });
      el.querySelectorAll('.rule-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this rule?')) return;
          const res = await this.api('DELETE', `/automation/rules/${btn.dataset.id}`);
          if (res?.success) { this.toast('Rule deleted'); this.loadRules(); }
        });
      });
    } else {
      el.innerHTML = '<div class="text-center py-8 text-gray-400 bg-white rounded-xl shadow-sm"><i class="fas fa-cogs text-4xl mb-3 text-gray-200"></i><p class="text-sm">No automation rules yet. Create one or use a preset.</p></div>';
    }
  },

  async loadExecutions() {
    const res = await this.api('GET', '/automation/executions?limit=10');
    const el = document.getElementById('execList');
    if (!el) return;
    if (res?.success && res.data.length) {
      el.innerHTML = `<div class="space-y-2">${res.data.map(e => `
        <div class="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-4 py-2.5">
          <div>
            <span class="font-medium">${e.rule_name}</span>
            <span class="badge ml-2 ${e.status === 'success' ? 'bg-green-100 text-green-700' : e.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}">${e.status}</span>
          </div>
          <span class="text-xs text-gray-400">${new Date(e.triggered_at).toLocaleString()}</span>
        </div>`).join('')}</div>`;
    } else el.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">No execution history.</p>';
  },

  async showPresets() {
    const modal = document.getElementById('ruleModal');
    const content = document.getElementById('ruleModalContent');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="flex justify-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-brand-500"></i></div>';

    const res = await this.api('GET', '/automation/presets');
    if (res?.success) {
      content.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold">Rule Presets</h2>
          <button onclick="document.getElementById('ruleModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-3">${res.data.map(p => `
          <div class="border rounded-lg p-4 hover:border-brand-300 transition cursor-pointer preset-card" data-preset='${JSON.stringify(p)}'>
            <h3 class="font-semibold text-gray-800">${p.name}</h3>
            <p class="text-sm text-gray-500 mt-1">${p.description}</p>
            <div class="flex items-center gap-2 mt-2">
              <span class="badge bg-blue-100 text-blue-700">${p.scope}</span>
              <span class="badge bg-gray-100 text-gray-600">${p.schedule?.frequency || 'hourly'}</span>
            </div>
          </div>`).join('')}</div>`;

      content.querySelectorAll('.preset-card').forEach(card => {
        card.addEventListener('click', async () => {
          const preset = JSON.parse(card.dataset.preset);
          const body = {
            name: preset.name, description: preset.description, scope: preset.scope,
            conditions: preset.conditions, condition_logic: preset.condition_logic,
            actions: preset.actions, schedule: preset.schedule,
            lookback_window: preset.lookback_window, cooldown_period: preset.cooldown_period,
          };
          const res = await this.api('POST', '/automation/rules', body);
          if (res?.success) { modal.classList.add('hidden'); this.toast('Rule created from preset!'); this.loadRules(); }
          else this.toast('Failed to create rule', 'error');
        });
      });
    }
  },

  showRuleForm() {
    const modal = document.getElementById('ruleModal');
    const content = document.getElementById('ruleModalContent');
    modal.classList.remove('hidden');
    content.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold">Create Automation Rule</h2>
        <button onclick="document.getElementById('ruleModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
      </div>
      <form id="ruleForm" class="space-y-4">
        <div><label class="block text-sm font-medium mb-1">Rule Name</label><input name="name" required class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div><label class="block text-sm font-medium mb-1">Description</label><input name="description" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-sm font-medium mb-1">Scope</label><select name="scope" class="w-full px-3 py-2 border rounded-lg text-sm bg-white"><option value="campaign">Campaign</option><option value="adset">Ad Set</option><option value="ad">Ad</option></select></div>
          <div><label class="block text-sm font-medium mb-1">Logic</label><select name="condition_logic" class="w-full px-3 py-2 border rounded-lg text-sm bg-white"><option value="AND">All conditions (AND)</option><option value="OR">Any condition (OR)</option></select></div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Condition</label>
          <div class="grid grid-cols-3 gap-2">
            <select name="cond_metric" class="px-3 py-2 border rounded-lg text-sm bg-white">
              ${['spend','ctr','cpc','cpm','clicks','impressions','frequency','roas','cpa'].map(m => `<option value="${m}">${m.toUpperCase()}</option>`).join('')}
            </select>
            <select name="cond_op" class="px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="greater_than">Greater than</option><option value="less_than">Less than</option><option value="equal_to">Equal to</option>
            </select>
            <input name="cond_value" type="number" step="0.01" required class="px-3 py-2 border rounded-lg text-sm" placeholder="Value">
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Action</label>
          <select name="action_type" class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
            <option value="pause">Pause</option><option value="activate">Activate</option><option value="increase_budget">Increase Budget 20%</option><option value="decrease_budget">Decrease Budget 20%</option><option value="send_notification">Send Notification</option>
          </select>
        </div>
        <button type="submit" class="w-full py-2.5 gradient-brand text-white rounded-lg font-semibold"><i class="fas fa-bolt mr-2"></i>Create Rule</button>
      </form>`;

    document.getElementById('ruleForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const actionType = fd.get('action_type');
      const body = {
        name: fd.get('name'), description: fd.get('description'), scope: fd.get('scope'),
        condition_logic: fd.get('condition_logic'),
        conditions: [{ metric: fd.get('cond_metric'), operator: fd.get('cond_op'), value: parseFloat(fd.get('cond_value')) }],
        actions: [{ type: actionType, params: actionType.includes('budget') ? { percentage: 20 } : {} }],
      };
      const res = await this.api('POST', '/automation/rules', body);
      if (res?.success) { modal.classList.add('hidden'); this.toast('Rule created!'); this.loadRules(); }
      else this.toast('Failed to create rule', 'error');
    });
  },

  // ==============  BILLING  ==============
  async renderBilling(el) {
    el.innerHTML = `
<div class="fade-in space-y-6">
  <div id="billingStatus">${this.skeleton('h-40')}</div>
  <div id="billingPlans">${this.skeleton('h-60')}</div>
</div>`;

    const [status, plans] = await Promise.all([
      this.api('GET', '/billing/status'),
      this.api('GET', '/billing/plans'),
    ]);

    if (status?.success) {
      const s = status.data;
      document.getElementById('billingStatus').innerHTML = `
        <div class="bg-white rounded-xl shadow-sm p-6">
          <h2 class="text-lg font-bold mb-4">Current Plan</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-brand-50 rounded-xl p-4">
              <div class="text-xs text-brand-600 uppercase font-medium mb-1">Plan</div>
              <div class="text-2xl font-bold text-brand-700 capitalize">${s.plan}</div>
              ${s.subscription ? `<div class="text-xs text-brand-500 mt-1">Renews ${new Date(s.subscription.current_period_end).toLocaleDateString()}</div>` : ''}
            </div>
            <div class="bg-gray-50 rounded-xl p-4">
              <div class="text-xs text-gray-500 uppercase font-medium mb-1">Usage This Month</div>
              <div class="space-y-2 mt-2">
                <div class="flex justify-between text-sm"><span>AI Requests</span><span class="font-medium">${s.usage.ai_requests}/${s.limits.ai_requests || '∞'}</span></div>
                <div class="flex justify-between text-sm"><span>Ad Accounts</span><span class="font-medium">${s.entity_counts.ad_accounts}/${s.limits.ad_accounts || '∞'}</span></div>
                <div class="flex justify-between text-sm"><span>Campaigns</span><span class="font-medium">${s.entity_counts.campaigns}/${s.limits.campaigns || '∞'}</span></div>
                <div class="flex justify-between text-sm"><span>Rules</span><span class="font-medium">${s.entity_counts.rules}/${s.limits.automation_rules || '∞'}</span></div>
              </div>
            </div>
            <div class="bg-gray-50 rounded-xl p-4">
              <div class="text-xs text-gray-500 uppercase font-medium mb-2">Quick Actions</div>
              <button id="manageSubBtn" class="w-full mb-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 font-medium"><i class="fas fa-external-link-alt mr-2"></i>Manage Subscription</button>
            </div>
          </div>
        </div>`;

      document.getElementById('manageSubBtn')?.addEventListener('click', async () => {
        const res = await this.api('POST', '/billing/create-portal');
        if (res?.success && res.data.portal_url) window.open(res.data.portal_url, '_blank');
        else this.toast('No active subscription', 'error');
      });
    }

    if (plans?.success) {
      document.getElementById('billingPlans').innerHTML = `
        <h2 class="text-lg font-bold mb-4">Available Plans</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          ${plans.data.map(p => `
            <div class="bg-white rounded-xl shadow-sm p-5 ${p.popular ? 'ring-2 ring-brand-500' : 'border border-gray-200'} card-hover relative">
              ${p.popular ? '<div class="absolute -top-3 left-1/2 -translate-x-1/2 badge bg-brand-500 text-white px-3 py-1 text-xs">MOST POPULAR</div>' : ''}
              <h3 class="text-lg font-bold text-gray-800">${p.name}</h3>
              <div class="mt-2 mb-4"><span class="text-3xl font-extrabold">${p.price === 0 ? 'Free' : '$' + p.price}</span>${p.price > 0 ? '<span class="text-gray-500 text-sm">/mo</span>' : ''}</div>
              <ul class="space-y-2 mb-5">${p.features.map(f => `<li class="flex items-start gap-2 text-sm text-gray-600"><i class="fas fa-check text-green-500 mt-0.5 text-xs"></i>${f}</li>`).join('')}</ul>
              ${p.id !== 'free' ? `<button class="w-full py-2 rounded-lg text-sm font-semibold ${p.popular ? 'gradient-brand text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'} plan-select" data-plan="${p.id}">
                ${status?.data?.plan === p.id ? 'Current Plan' : 'Upgrade'}
              </button>` : '<button class="w-full py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-400" disabled>Free Tier</button>'}
            </div>`).join('')}
        </div>`;

      document.querySelectorAll('.plan-select').forEach(btn => {
        if (status?.data?.plan === btn.dataset.plan) { btn.disabled = true; return; }
        btn.addEventListener('click', async () => {
          const res = await this.api('POST', '/billing/create-checkout', { plan: btn.dataset.plan });
          if (res?.success && res.data.checkout_url) window.location.href = res.data.checkout_url;
          else this.toast('Checkout failed. Ensure Stripe is configured.', 'error');
        });
      });
    }
  },

  // ==============  SETTINGS  ==============
  renderSettings(el) {
    el.innerHTML = `
<div class="fade-in space-y-6 max-w-2xl">
  <div class="bg-white rounded-xl shadow-sm p-6">
    <h2 class="text-lg font-bold mb-4"><i class="fas fa-user text-gray-400 mr-2"></i>Profile</h2>
    <div class="space-y-4">
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Name</label><input id="settingsName" type="text" value="${this.state.user?.name || ''}" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" value="${this.state.user?.email || ''}" disabled class="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-500"></div>
    </div>
  </div>

  <div class="bg-white rounded-xl shadow-sm p-6">
    <h2 class="text-lg font-bold mb-4"><i class="fab fa-meta text-meta-blue mr-2"></i>Meta Accounts</h2>
    <div id="metaAccountsList">${this.skeleton('h-20')}</div>
    <button id="connectMetaBtn" class="mt-4 px-4 py-2 text-sm bg-meta-blue text-white rounded-lg font-medium hover:bg-meta-dark"><i class="fab fa-facebook mr-2"></i>Connect Meta Account</button>
  </div>

  <div class="bg-white rounded-xl shadow-sm p-6">
    <h2 class="text-lg font-bold mb-4"><i class="fas fa-shield-alt text-gray-400 mr-2"></i>API Keys</h2>
    <div class="space-y-3 text-sm">
      <div class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
        <div><span class="font-medium">Meta App ID</span><p class="text-xs text-gray-400">Configured via environment variables</p></div>
        <span class="badge bg-green-100 text-green-700">Configured</span>
      </div>
      <div class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
        <div><span class="font-medium">OpenAI API Key</span><p class="text-xs text-gray-400">Powers AI optimization engine</p></div>
        <span class="badge bg-green-100 text-green-700">Configured</span>
      </div>
      <div class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
        <div><span class="font-medium">Stripe Secret Key</span><p class="text-xs text-gray-400">Billing and subscription management</p></div>
        <span class="badge bg-green-100 text-green-700">Configured</span>
      </div>
    </div>
  </div>
</div>`;

    this.loadMetaAccounts();

    document.getElementById('connectMetaBtn')?.addEventListener('click', async () => {
      const res = await this.api('GET', '/auth/meta/connect?workspace_id=' + this.state.workspaceId);
      if (res?.success && res.data.authUrl) window.location.href = res.data.authUrl;
      else this.toast('Meta OAuth not configured', 'error');
    });
  },

  async loadMetaAccounts() {
    const res = await this.api('GET', '/auth/meta/accounts');
    const el = document.getElementById('metaAccountsList');
    if (!el) return;
    if (res?.success && res.data.length) {
      el.innerHTML = `<div class="space-y-2">${res.data.map(a => `
        <div class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 text-sm">
          <div>
            <span class="font-medium">${a.name}</span>
            <span class="text-gray-400 ml-2">${a.meta_account_id}</span>
            <span class="badge ml-2 ${a.token_health === 'healthy' ? 'bg-green-100 text-green-700' : a.token_health === 'expiring_soon' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}">${a.token_health}</span>
          </div>
          <div class="text-gray-500">${a.currency} &middot; Last sync: ${a.last_synced_at ? new Date(a.last_synced_at).toLocaleDateString() : 'Never'}</div>
        </div>`).join('')}</div>`;
    } else el.innerHTML = '<p class="text-gray-400 text-sm">No Meta accounts connected.</p>';
  },

  // ==============  UTILS  ==============
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },

  // ==============  INIT  ==============
  async init() {
    window.addEventListener('popstate', e => { this.state.page = e.state?.page || 'dashboard'; this.render(); });

    // Check URL params
    const params = new URLSearchParams(location.search);
    if (params.get('meta_connected')) this.toast(`Meta connected! ${params.get('accounts') || ''} accounts linked.`);
    if (params.get('billing') === 'success') this.toast('Subscription activated!');

    // Load user profile if authenticated
    if (this.state.token) {
      const me = await this.api('GET', '/auth/me');
      if (me?.success) {
        this.state.user = me.data.user;
        this.state.workspaces = me.data.workspaces || [];
        if (!this.state.workspaceId && this.state.workspaces.length) {
          this.state.workspaceId = this.state.workspaces[0].id;
          localStorage.setItem('af_workspace', this.state.workspaceId);
        }
      } else {
        this.state.token = null;
        this.state.page = 'login';
      }
    } else {
      this.state.page = 'login';
    }

    this.render();
  },
};

// Boot
AF.init();
