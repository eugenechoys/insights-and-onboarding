// === Choys Intelligence App ===

// ---- Screen Navigation ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goHome() { showScreen('landing'); }
function enterExisting() { showScreen('dashboard-screen'); if (ChoysAPI.isConnected()) loadIntelligence(); }
function enterNew() { showScreen('chat-screen'); if (!chatState.started) startChat(); }
function enterSettings() {
  showScreen('settings-screen');
  document.getElementById('ls-url').value = ChoysAPI.baseUrl;
  document.getElementById('ls-token').value = ChoysAPI.accessToken;
  document.getElementById('ls-oai').value = ChoysAPI.openaiKey;
}

// ---- Landing Settings ----
function saveLandingSettings() {
  ChoysAPI.saveSettings(
    document.getElementById('ls-url').value,
    document.getElementById('ls-token').value,
    document.getElementById('ls-oai').value
  );
  document.getElementById('ls-status').innerHTML = '<span style="color:var(--green)">Saved!</span>';
  syncSettingsUI();
}

// ---- Dashboard Settings ----
function saveSettings() {
  ChoysAPI.saveSettings(
    document.getElementById('s-url').value,
    document.getElementById('s-token').value,
    document.getElementById('s-oai').value
  );
  document.getElementById('conn-status').innerHTML = '<span style="color:var(--green)">Saved!</span>';
  updateDashAuth();
}
async function testConnection() {
  document.getElementById('conn-status').innerHTML = '<span style="color:var(--yellow)">Testing...</span>';
  const res = await ChoysAPI.getTenantDetail();
  if (res.error || res.statusCode >= 400) {
    document.getElementById('conn-status').innerHTML = `<span style="color:var(--red)">Failed: ${res.message || 'Unauthorized'}</span>`;
  } else {
    document.getElementById('conn-status').innerHTML = `<span style="color:var(--green)">Connected! ${res.data?.name || ''}</span>`;
    updateDashAuth(true);
    loadIntelligence();
  }
}
async function sendOTP() {
  const res = await ChoysAPI.sendOTP(document.getElementById('s-email').value);
  alert(res.data?.message || res.message);
}
async function verifyOTP() {
  const res = await ChoysAPI.verifyOTP(document.getElementById('s-email').value, document.getElementById('s-otp').value);
  if (res.data?.accessToken) {
    document.getElementById('s-token').value = res.data.accessToken;
    saveSettings();
    alert('Authenticated!');
    loadIntelligence();
  } else alert('Failed: ' + (res.message || JSON.stringify(res)));
}
function updateDashAuth(connected) {
  const el = document.getElementById('dash-auth');
  const c = connected ?? ChoysAPI.isConnected();
  el.innerHTML = `<span class="dot ${c ? 'green' : 'red'}"></span> ${c ? 'Connected' : 'Not Connected'}`;
}
function syncSettingsUI() {
  ['s-url', 'ls-url'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ChoysAPI.baseUrl; });
  ['s-token', 'ls-token'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ChoysAPI.accessToken; });
  ['s-oai', 'ls-oai'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ChoysAPI.openaiKey; });
}

// ---- Dashboard Tabs ----
document.querySelectorAll('.dash-nav li').forEach(li => {
  li.addEventListener('click', () => {
    document.querySelectorAll('.dash-nav li').forEach(l => l.classList.remove('active'));
    li.classList.add('active');
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${li.dataset.tab}`).classList.add('active');
    const t = { intelligence: 'Intelligence Dashboard', settings: 'Settings' };
    document.getElementById('dash-title').textContent = t[li.dataset.tab] || '';
    const sub = { intelligence: 'AI-powered analysis of your Choys tenant', settings: 'API connection & authentication' };
    document.getElementById('dash-subtitle').textContent = sub[li.dataset.tab] || '';
  });
});

// ---- Collapsible Sections ----
function toggleSection(headerEl) {
  const section = headerEl.closest('.intel-section');
  section.classList.toggle('collapsed');
  const chevron = headerEl.querySelector('.section-chevron');
  if (chevron) chevron.textContent = section.classList.contains('collapsed') ? '▸' : '▾';
}

// ---- Period Selector ----
function getSelectedPeriod() {
  return parseInt(document.getElementById('period-select')?.value) || 3;
}
function onPeriodChange() {
  loadIntelligence();
}

// ---- Environment Selector ----
const ENV_URLS = {
  dev: 'https://api.dev.choysapp.com',
  prod: 'https://prodapi.choysapp.com'
};

function onEnvChange() {
  const env = document.getElementById('env-select')?.value || 'dev';
  const newUrl = ENV_URLS[env];
  ChoysAPI.baseUrl = newUrl;
  localStorage.setItem('choys_base_url', newUrl);
  // Clear current tokens — user must re-auth for new env
  ChoysAPI.accessToken = '';
  ChoysAPI.refreshToken = '';
  ChoysAPI.selectedTenantId = null;
  localStorage.removeItem('choys_access_token');
  localStorage.removeItem('choys_refresh_token');
  // Update settings UI
  syncSettingsUI();
  updateDashAuth();
  // Reset tenant dropdown
  const tSel = document.getElementById('tenant-select');
  if (tSel) tSel.innerHTML = '<option value="all">All Tenants (Global)</option>';
  // Switch to settings tab so user can authenticate
  document.querySelectorAll('.dash-nav li').forEach(l => l.classList.remove('active'));
  document.querySelector('.dash-nav li[data-tab="settings"]')?.classList.add('active');
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-settings')?.classList.add('active');
  document.getElementById('dash-title').textContent = 'Settings';
  document.getElementById('dash-subtitle').textContent = `Switched to ${env.toUpperCase()} — please authenticate`;
  document.getElementById('conn-status').innerHTML = `<span style="color:var(--yellow)">Switched to ${env.toUpperCase()}. Please send OTP to authenticate.</span>`;
}

function initEnvSelector() {
  const sel = document.getElementById('env-select');
  if (!sel) return;
  // Detect current env from stored base URL
  const current = ChoysAPI.baseUrl;
  if (current.includes('prodapi')) sel.value = 'prod';
  else sel.value = 'dev';
}

// ---- Tenant Selector ----
let _tenantList = [];
let _currentTenantName = '';

function onTenantChange() {
  const sel = document.getElementById('tenant-select');
  const val = sel?.value;
  if (val === 'all') {
    _currentTenantName = 'All Tenants';
    ChoysAPI.selectedTenantId = null;
  } else {
    const t = _tenantList.find(t => (t.id || t.tenantId) === val);
    _currentTenantName = t?.companyName || t?.name || 'Unknown';
    ChoysAPI.selectedTenantId = val;
  }
  // Reload all intelligence data with new tenant context
  loadIntelligence();
}

function populateTenantDropdown(tenants) {
  const sel = document.getElementById('tenant-select');
  if (!sel) return;
  const currentVal = ChoysAPI.selectedTenantId || 'all';
  _tenantList = Array.isArray(tenants) ? tenants : (tenants?.tenants || tenants?.data || []);
  sel.innerHTML = '<option value="all">All Tenants (Global)</option>';
  _tenantList.forEach(t => {
    const name = t.companyName || t.name || 'Unknown';
    const id = t.id || t.tenantId || name;
    const expired = t.isExpired ? ' (Expired)' : '';
    sel.innerHTML += `<option value="${id}">${name}${expired}</option>`;
  });
  // Restore previously selected tenant
  sel.value = currentVal;
}

// ===========================================================
//  UNIFIED INTELLIGENCE DASHBOARD
// ===========================================================
let charts = {};

async function loadIntelligence() {
  if (!ChoysAPI.isConnected()) {
    document.getElementById('health-headline').textContent = 'Connect your API to see live data';
    document.getElementById('health-subline').textContent = 'Go to Settings tab and add your access token.';
    return;
  }
  updateDashAuth(true);

  const period = getSelectedPeriod();

  // Show loading state
  document.getElementById('health-headline').textContent = 'Analyzing your wellness data...';
  document.getElementById('health-subline').textContent = 'Pulling metrics from Choys backend';

  // AI insights strip loading state
  const stripEl = document.getElementById('ai-insights-strip');
  if (stripEl) stripEl.innerHTML = '<div class="ai-strip-loading"><div class="spinner"></div><span class="text-muted">AI analyzing your data...</span></div>';

  // === PHASE 1: Core metrics (fast render) ===
  const [overview, activity, features, userStats, aiSummary, recognition, aiInsights, coinInsights] = await Promise.allSettled([
    ChoysAPI.getOverviewStats(),
    ChoysAPI.getEmployeeActivity(),
    ChoysAPI.getFeatureTrend(),
    ChoysAPI.getUserStats(),
    ChoysAPI.getAISummary(),
    ChoysAPI.getRecognitionInsights(period),
    ChoysAPI.getAIInsights(),
    ChoysAPI.getCoinInsights(period)
  ]);

  const stats = overview.value?.data?.statsData || {};
  const delta = overview.value?.data?.deltaData || {};
  const act = activity.value?.data || {};
  const feat = features.value?.data || {};
  const us = userStats.value?.data || {};
  const ai = aiSummary.value?.data || {};
  const recog = recognition.value?.data || {};
  const aiIns = aiInsights.value?.data || {};
  const coins = coinInsights.value?.data || {};

  // Store raw data for AI analysis
  window._rawData = {
    overview: overview.value, activity: activity.value, features: features.value,
    userStats: userStats.value, aiSummary: aiSummary.value, recognition: recognition.value,
    aiInsights: aiInsights.value, coinInsights: coinInsights.value
  };

  // ---- Signal Cards ----
  const totalUsers = us.activeCount || 0;
  const pendingUsers = us.pendingCount || 0;
  setText('sv-users', totalUsers + pendingUsers);
  setDelta('sd-users', null, `${totalUsers} active, ${pendingUsers} pending`);

  const activeWeek = ai.totalActiveUsers?.value || act.activityData?.length || 0;
  setText('sv-active', activeWeek);
  setTrend('sd-active', ai.totalActiveUsers);

  const stickiness = ai.stickiness?.value || '0%';
  setText('sv-stickiness', stickiness);
  setTrend('sd-stickiness', ai.stickiness);

  setText('sv-mood', stats.moodRecords || 0);
  setDeltaPct('sd-mood', delta.moodDelta, delta.moodGrowth);

  setText('sv-recog', stats.recognitionUsage || recog.totalGiven || 0);
  setDeltaPct('sd-recog', delta.recognitionDelta, delta.recognitionGrowth);

  setText('sv-steps', (stats.totalSteps || 0).toLocaleString());
  setDeltaPct('sd-steps', delta.stepsDelta, delta.stepsGrowth);

  // ---- Health Score ----
  const score = computeHealthScore(stats, delta, ai, totalUsers, pendingUsers);
  setText('health-score', score.value);
  renderHealthRing(score.value);
  document.getElementById('health-headline').textContent = score.headline;
  document.getElementById('health-subline').textContent = score.subline;
  renderBadges(score.badges);

  // ---- Charts ----
  renderActivityChart(act);
  renderFeatureBars(feat);
  renderRecogValues(recog);

  // ---- Engagement & Retention (from AI insights) ----
  renderEngagementFunnel(aiIns, us);
  renderRetentionDonut(aiIns);

  // === PHASE 2: Deep data (mood, recognition feed, coins, people, tenants) ===
  const [moodTracker, moodRecord, moodMeter, moodPart, recentRecog, topContrib, giftCards, userList, tenantList, aiProductivity] = await Promise.allSettled([
    ChoysAPI.getMoodTracker(period),
    ChoysAPI.getMoodRecord(period),
    ChoysAPI.getMoodMeterStats(period),
    ChoysAPI.getMoodParticipation(period),
    ChoysAPI.getRecentRecognitions(),
    ChoysAPI.getTopContributors(),
    ChoysAPI.getGiftCardInsights(),
    ChoysAPI.listTenantUsers(200),
    ChoysAPI.getTenantList(),
    ChoysAPI.getAIProductivity()
  ]);

  const v = k => k.value?.data || k.value || {};
  const mTrack = v(moodTracker);
  const mRec = v(moodRecord);
  const mMeter = v(moodMeter);
  const mPart = v(moodPart);
  const rRecent = v(recentRecog);
  const rTop = v(topContrib);
  const cIns = coins; // already fetched in phase 1
  const gCards = v(giftCards);
  const uList = v(userList);
  const tList = v(tenantList);
  const aiProd = v(aiProductivity);

  // Store extended data
  window._rawData = { ...window._rawData, moodTracker: mTrack, moodRecord: mRec, coinInsights: cIns, productivity: aiProd };

  // Set current tenant name from tenant detail or selected dropdown (before rendering people table)
  if (ChoysAPI.selectedTenantId) {
    // Using dropdown-selected tenant name
    const t = _tenantList.find(t => (t.id || t.tenantId) === ChoysAPI.selectedTenantId);
    if (t) _currentTenantName = t.companyName || t.name || 'Unknown';
  } else {
    const tenantDetail = await ChoysAPI.getTenantDetail();
    const td = tenantDetail?.data?.tenant || tenantDetail?.data || {};
    _currentTenantName = td.companyName || td.name || 'Current Tenant';
  }

  // Render phase 2 sections
  renderMoodInsights(mTrack, mRec, mMeter, mPart);
  renderRecognitionFeed(rRecent, rTop);
  renderCoinsEconomy(cIns, gCards);
  renderProductivity(aiProd);
  renderSuccessTracker(aiIns);
  renderPeopleTable(uList);
  populateTenantDropdown(tList);

  // === PHASE 3: AI Key Insights + Auto Deep Analysis ===
  generateKeyInsights(score, aiIns, mMeter, mPart, recog, cIns, us, stats);
  runDeepAnalysis();
}

// ===========================================================
//  AI KEY INSIGHTS STRIP
// ===========================================================

async function generateKeyInsights(score, aiIns, mMeter, mPart, recog, coins, us, stats) {
  const stripEl = document.getElementById('ai-insights-strip');
  if (!stripEl) return;

  // Gather data snapshot
  const meterData = mMeter?.data || mMeter || {};
  const partData = mPart?.data || mPart || {};
  const segments = aiIns?.featureDeepDive?.retentionHealth?.segments || [];
  const depthArr = aiIns?.featureDeepDive?.engagementDepth || [];
  const successMetrics = aiIns?.successMetrics?.metrics || [];
  const totalUsers = (us.activeCount || 0) + (us.pendingCount || 0);

  const dataSnapshot = {
    healthScore: score.value,
    totalUsers,
    activeUsers: us.activeCount || 0,
    retentionSegments: segments.map(s => `${s.label}: ${s.count || s.users}`).join(', '),
    avgMood: meterData.percentageAverageMood || 'N/A',
    moodParticipation: `${partData.activeMoodUsers || 0}/${partData.totalActiveUsers || totalUsers}`,
    featuresUsed: [stats.moodRecords, stats.recognitionUsage, stats.habitTracked, stats.totalSteps].filter(v => v > 0).length,
    recognitionCount: recog.totalGiven || stats.recognitionUsage || 0,
    engagementDepth: depthArr.map(d => `${d.label}: ${d.users}`).join(', '),
    successMetrics: successMetrics.map(m => `${m.metricName}: ${m.currentValue}/${m.targetValue}`).join(', '),
    stickiness: score.badges.find(b => b.text.includes('Stickiness'))?.text || 'N/A'
  };

  const prompt = `You are analyzing a Choys employee wellness platform tenant. Return ONLY a valid JSON array of exactly 5-6 key insights. Each object must have: title (short, max 6 words), insight (1 sentence, max 20 words), severity ("green" for positive, "amber" for needs attention, "red" for urgent), category (one of: Retention, Engagement, Wellness, Recognition, Growth, Risk).

Data snapshot:
- Health Score: ${dataSnapshot.healthScore}/100
- Users: ${dataSnapshot.activeUsers} active / ${dataSnapshot.totalUsers} total
- Retention segments: ${dataSnapshot.retentionSegments}
- Avg Mood: ${dataSnapshot.avgMood}%, Participation: ${dataSnapshot.moodParticipation}
- Features used: ${dataSnapshot.featuresUsed}/4
- Recognitions: ${dataSnapshot.recognitionCount}
- Engagement: ${dataSnapshot.engagementDepth}
- Success: ${dataSnapshot.successMetrics}

Focus on actionable insights the Choys team can share with this customer. Be specific with numbers.`;

  const res = await ChoysAPI.chatWithAI([
    { role: 'system', content: 'You are a data analyst. Return ONLY valid JSON. No markdown, no explanation.' },
    { role: 'user', content: prompt }
  ], { json: true, maxTokens: 800 });

  if (res.error) {
    stripEl.innerHTML = '<div class="ai-strip-loading"><span class="text-muted">AI insights unavailable — check OpenAI key in Settings</span></div>';
    return;
  }

  try {
    let insights = JSON.parse(res.content);
    // Handle if wrapped in an object like { insights: [...] }
    if (!Array.isArray(insights)) insights = insights.insights || insights.data || Object.values(insights)[0];
    if (!Array.isArray(insights)) throw new Error('Not an array');

    const categoryIcons = { Retention: '🔄', Engagement: '📈', Wellness: '🧘', Recognition: '🏅', Growth: '🌱', Risk: '⚠️' };

    stripEl.innerHTML = insights.slice(0, 6).map(i => `
      <div class="ai-insight-card severity-${i.severity || 'amber'}">
        <div class="aic-category">${categoryIcons[i.category] || '📊'} ${i.category || 'Insight'}</div>
        <div class="aic-title">${i.title}</div>
        <div class="aic-body">${i.insight}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error('AI insights parse error:', e, res.content);
    stripEl.innerHTML = '<div class="ai-strip-loading"><span class="text-muted">Could not parse AI insights</span></div>';
  }
}

// ===========================================================
//  HEALTH SCORE
// ===========================================================

function computeHealthScore(stats, delta, ai, totalUsers, pendingUsers) {
  let score = 0;
  const badges = [];
  const allUsers = totalUsers + pendingUsers;

  const adoptionRate = allUsers > 0 ? (totalUsers / allUsers) : 0;
  score += Math.min(adoptionRate * 40, 40);

  const featuresUsed = [stats.moodRecords, stats.recognitionUsage, stats.habitTracked, stats.totalSteps].filter(v => v > 0).length;
  score += featuresUsed * 8;

  const stickyVal = parseFloat(ai.stickiness?.value) || 0;
  score += Math.min(stickyVal / 100 * 15, 15);

  const isGrowing = delta.moodGrowth === '+' || delta.recognitionGrowth === '+';
  if (isGrowing) score += 13;

  score = Math.round(Math.min(score, 100));

  if (adoptionRate >= 0.5) badges.push({ text: 'Strong Adoption', type: 'up' });
  else if (adoptionRate > 0) badges.push({ text: `${Math.round(adoptionRate * 100)}% Activated`, type: adoptionRate > 0.2 ? 'neutral' : 'down' });
  else badges.push({ text: 'No Active Users', type: 'down' });

  if (featuresUsed >= 3) badges.push({ text: `${featuresUsed}/4 Features Used`, type: 'up' });
  else if (featuresUsed > 0) badges.push({ text: `${featuresUsed}/4 Features Used`, type: 'neutral' });
  else badges.push({ text: 'No Feature Usage', type: 'down' });

  if (ai.stickiness?.isIncrease === true) badges.push({ text: 'Stickiness Growing', type: 'up' });
  else if (ai.stickiness?.isIncrease === false) badges.push({ text: 'Stickiness Declining', type: 'down' });

  if (stats.totalSteps > 0) badges.push({ text: `${stats.totalSteps.toLocaleString()} Steps`, type: 'info' });

  let headline, subline;
  if (score >= 70) {
    headline = 'Choys is working well for your team';
    subline = 'Strong engagement across multiple features. Keep the momentum going!';
  } else if (score >= 40) {
    headline = 'Good start — room to grow';
    subline = 'Some features are getting traction. Focus on activating pending users and broadening feature use.';
  } else if (score > 0) {
    headline = 'Early days — let\'s build momentum';
    subline = 'Your team is just getting started. Run a kickoff campaign to boost adoption.';
  } else {
    headline = 'No activity yet';
    subline = 'Connect your API token or start onboarding users to see your wellness scorecard.';
  }

  return { value: score, headline, subline, badges };
}

function renderHealthRing(score) {
  const canvas = document.getElementById('health-ring');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 80, cy = 80, r = 65, lw = 10;
  ctx.clearRect(0, 0, 160, 160);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#2a2d3a';
  ctx.lineWidth = lw;
  ctx.stroke();

  const pct = Math.max(score, 0) / 100;
  const start = -Math.PI / 2;
  const end = start + pct * Math.PI * 2;
  const gradient = ctx.createLinearGradient(0, 0, 160, 160);
  if (score >= 70) { gradient.addColorStop(0, '#00cec9'); gradient.addColorStop(1, '#55efc4'); }
  else if (score >= 40) { gradient.addColorStop(0, '#fdcb6e'); gradient.addColorStop(1, '#e17055'); }
  else { gradient.addColorStop(0, '#ff7675'); gradient.addColorStop(1, '#d63031'); }

  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function renderBadges(badges) {
  const el = document.getElementById('health-badges');
  el.innerHTML = badges.map(b => `<span class="badge ${b.type}">${b.text}</span>`).join('');
}

// ---- Signal Card Helpers ----
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = typeof val === 'number' ? val.toLocaleString() : val; }

function setDelta(id, val, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'sig-delta flat';
}
function setDeltaPct(id, pct, growth) {
  const el = document.getElementById(id);
  if (!el) return;
  if (pct === undefined || pct === null) { el.textContent = ''; return; }
  const isUp = growth === '+';
  el.textContent = `${isUp ? '+' : '-'}${pct}% WoW`;
  el.className = `sig-delta ${isUp ? 'up' : pct === 0 ? 'flat' : 'down'}`;
}
function setTrend(id, obj) {
  const el = document.getElementById(id);
  if (!el || !obj) return;
  if (obj.trend) {
    const isUp = obj.isIncrease;
    el.textContent = `${obj.trend} WoW`;
    el.className = `sig-delta ${isUp ? 'up' : 'down'}`;
  }
}

// ---- Activity Chart ----
function renderActivityChart(act) {
  const ctx = document.getElementById('c-activity');
  if (!ctx) return;
  if (charts['c-activity']) charts['c-activity'].destroy();

  const labels = act.xCategory || [];
  const values = (act.series || []).map(v => parseInt(v) || 0);
  if (!labels.length) return;

  charts['c-activity'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Active Users',
        data: values,
        borderColor: '#6c5ce7',
        backgroundColor: 'rgba(108,92,231,.15)',
        fill: true,
        tension: .4,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: '#6c5ce7',
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false, backgroundColor: '#1a1c26', titleColor: '#e4e6ef', bodyColor: '#e4e6ef', borderColor: '#2a2d3a', borderWidth: 1, padding: 10, displayColors: false,
          callbacks: { label: (c) => `${c.parsed.y} active users` }
        }
      },
      scales: {
        x: { ticks: { color: '#6b7087', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(42,45,58,.5)' } },
        y: { ticks: { color: '#6b7087', font: { size: 11 }, stepSize: 1 }, grid: { color: 'rgba(42,45,58,.5)' }, beginAtZero: true }
      }
    }
  });
}

// ---- Feature Bars ----
function renderFeatureBars(feat) {
  const el = document.getElementById('feature-bars');
  if (!el) return;

  const features = [
    { name: 'Mood', val: parseInt(feat.moodUsers) || 0, color: '#6c5ce7' },
    { name: 'Recognition', val: parseInt(feat.recognitionUsers) || 0, color: '#00cec9' },
    { name: 'Steps', val: parseInt(feat.stepsUsers) || 0, color: '#fdcb6e' },
    { name: 'Habits', val: parseInt(feat.habitsUsers) || 0, color: '#ff7675' }
  ];

  const max = Math.max(...features.map(f => f.val), 1);

  const totalFeatUsers = features.reduce((a, f) => a + f.val, 0);
  el.innerHTML = features.map(f => {
    const pct = Math.max((f.val / max) * 100, 0);
    const adoptPct = totalFeatUsers > 0 ? Math.round((f.val / max) * 100) : 0;
    return `<div class="feat-row">
      <span class="feat-name">${f.name}</span>
      <div class="feat-bar-track">
        <div class="feat-bar-fill" style="width:${pct}%;background:${f.color}"></div>
        <span class="feat-bar-val">${f.val} user${f.val !== 1 ? 's' : ''} (${adoptPct}%)</span>
      </div>
    </div>`;
  }).join('');
  // Add summary below
  const usedCount = features.filter(f => f.val > 0).length;
  el.innerHTML += `<div style="margin-top:10px;font-size:11px;color:var(--muted)">${usedCount}/4 features active · ${totalFeatUsers} total feature interactions</div>`;
}

// ---- Recognition Values ----
function renderRecogValues(recog) {
  const section = document.getElementById('recog-section');
  const el = document.getElementById('value-chips');
  if (!section || !el) return;

  const values = recog.valueTrend || [];
  const withCount = values.filter(v => v.count > 0);
  if (!withCount.length && !recog.totalGiven) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  el.innerHTML = values.map(v =>
    `<div class="value-chip">${v.value.replace(/-/g, ' ')}<span class="vc-count">${v.count}</span></div>`
  ).join('');

  if (recog.coinsShared) {
    el.innerHTML += `<div class="value-chip" style="border-color:var(--green)">Coins Shared<span class="vc-count" style="background:var(--green)">${recog.coinsShared}</span></div>`;
  }
}

// ---- AI Verdict ----
async function runDeepAnalysis() {
  const el = document.getElementById('ai-verdict');
  const btn = document.getElementById('btn-verdict');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  el.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner"></div><p class="text-muted" style="margin-top:8px">AI is analyzing your data...</p></div>';

  const rawData = window._rawData || {};
  const context = JSON.stringify(rawData, null, 2).slice(0, 8000);

  const prompt = `You're a senior PM reviewing a Choys tenant's wellness data. The HR person reading this has 2 minutes. Be direct and specific.

Format your response as:

## The Bottom Line
One sentence: is Choys working for this company or not? Be honest.

## What's Working
Bullet the metrics that look good. Use actual numbers.

## What Needs Attention
Bullet the red flags. Don't sugarcoat.

## This Week's Actions
3 specific things the HR team should do RIGHT NOW. Be actionable — not "improve engagement" but "Send a Slack reminder about mood check-ins targeting the ${rawData?.userStats?.data?.pendingCount || 0} pending users".

## Program Recommendations
Based on the data gaps, what 2 programs should launch next? Be specific about which Choys features to use (mood tracking, step challenges, habit tracking, peer recognition, team challenges, PERMA surveys, campaigns, leaderboards, coins/rewards).

Use markdown. Be punchy. Skip the fluff.`;

  const res = await ChoysAPI.analyzeWithAI(prompt, context);
  btn.disabled = false;
  btn.textContent = 'Regenerate';

  if (res.error) {
    el.innerHTML = `<span style="color:var(--red)">Error: ${res.message}</span>`;
    return;
  }
  el.innerHTML = marked.parse(res.content);
}

// ===========================================================
//  SECTION RENDERS
// ===========================================================

// --- 1. Engagement Funnel ---
function renderEngagementFunnel(aiIns, uList) {
  const el = document.getElementById('funnel-bars');
  const sowhat = document.getElementById('funnel-sowhat');
  if (!el) return;

  const depthArr = aiIns?.featureDeepDive?.engagementDepth || [];
  const users = Array.isArray(uList) ? uList : (uList?.users || uList?.data || []);
  const totalUsers = users.length || (uList?.activeCount || 0) + (uList?.pendingCount || 0) || 0;

  const power = depthArr.find(d => d.label?.toLowerCase().includes('power'))?.users || 0;
  const dual = depthArr.find(d => d.label?.toLowerCase().includes('dual'))?.users || 0;
  const single = depthArr.find(d => d.label?.toLowerCase().includes('single'))?.users || 0;
  const active = power + dual + single;

  const steps = [
    { label: 'Total Registered', val: totalUsers, color: '#6c5ce7' },
    { label: 'Active Users', val: active, color: '#00cec9' },
    { label: 'Multi-Feature', val: power + dual, color: '#fdcb6e' },
    { label: 'Power Users', val: power, color: '#ff7675' }
  ];

  const max = Math.max(totalUsers, 1);
  el.innerHTML = steps.map(s => {
    const pct = Math.max((s.val / max) * 100, 8);
    const pctLabel = totalUsers > 0 ? Math.round((s.val / totalUsers) * 100) + '%' : '0%';
    return `<div class="funnel-bar">
      <span class="funnel-bar-label">${s.label}</span>
      <div class="funnel-bar-track" style="width:${pct}%;background:${s.color}"><span class="funnel-bar-val">${s.val}</span></div>
      <span class="funnel-bar-pct">${pctLabel}</span>
    </div>`;
  }).join('');

  if (sowhat) {
    const headline = aiIns?.featureDeepDive?.whatThisMeans?.headline;
    const dropPct = totalUsers > 0 ? Math.round(((totalUsers - active) / totalUsers) * 100) : 0;
    sowhat.innerHTML = headline ? `<strong>What this means:</strong> ${headline}` : `<strong>Drop-off:</strong> ${dropPct}% of registered users are not active.`;
  }
}

// --- 2. Retention Donut ---
function renderRetentionDonut(aiIns) {
  const canvas = document.getElementById('c-retention-donut');
  const legend = document.getElementById('retention-legend');
  const sowhat = document.getElementById('retention-sowhat');
  if (!canvas) return;

  const segments = aiIns?.featureDeepDive?.retentionHealth?.segments || [];
  if (!segments.length) { if (legend) legend.innerHTML = '<span class="text-muted">No retention data</span>'; return; }

  if (charts['c-retention-donut']) charts['c-retention-donut'].destroy();
  const colors = ['#00cec9', '#55efc4', '#fdcb6e', '#ff7675'];
  const total = segments.reduce((a, s) => a + (s.count || s.users), 0);

  charts['c-retention-donut'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: segments.map(s => s.label),
      datasets: [{ data: segments.map(s => (s.count || s.users)), backgroundColor: colors.slice(0, segments.length), borderWidth: 2, borderColor: '#12131a' }]
    },
    options: { responsive: true, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1c26', titleColor: '#e4e6ef', bodyColor: '#e4e6ef', borderColor: '#2a2d3a', borderWidth: 1, padding: 10, callbacks: { label: (c) => { const pct = total > 0 ? Math.round(c.parsed / total * 100) : 0; return `${c.label}: ${c.parsed} users (${pct}%)`; } } } }, cutout: '55%' }
  });

  if (legend) {
    legend.innerHTML = segments.map((s, i) => {
      const pct = total > 0 ? Math.round(((s.count || s.users) / total) * 100) : 0;
      return `<div class="retention-legend-item"><span class="retention-legend-dot" style="background:${colors[i]}"></span>${s.label}: ${(s.count || s.users)} (${pct}%)</div>`;
    }).join('');
  }

  if (sowhat) {
    const churning = segments.find(s => s.label?.toLowerCase().includes('churn') || s.label?.toLowerCase().includes('30'));
    sowhat.innerHTML = churning && (churning.count || churning.users) > 0
      ? `<strong>Churn risk:</strong> ${churning.count || churning.users} users haven't been active in 30+ days. Consider a re-engagement campaign.`
      : '<strong>Retention looks healthy.</strong> Most users are active within the last 2 weeks.';
  }
}

// --- 3. Mood Insights ---
function renderMoodInsights(mTrack, mRec, mMeter, mPart) {
  const kpis = document.getElementById('mood-kpis');
  const trendCanvas = document.getElementById('c-mood-trend');
  const distCanvas = document.getElementById('c-mood-dist');
  const sowhat = document.getElementById('mood-sowhat');

  const meterData = mMeter?.data || mMeter || {};
  const partData = mPart?.data || mPart || {};
  const trackData = mTrack?.data || mTrack || {};
  const recData = mRec?.data || mRec || {};

  if (kpis) {
    const avg = meterData.percentageAverageMood || meterData.averageMood || '--';
    const activeMood = partData.activeMoodUsers || 0;
    const totalActive = partData.totalActiveUsers || 0;
    const participation = totalActive > 0 ? `${activeMood}/${totalActive}` : '--';
    kpis.innerHTML = `
      <div class="mini-stat"><span class="ms-val">${avg}%</span><span class="ms-label">Avg Mood</span></div>
      <div class="mini-stat"><span class="ms-val">${participation}</span><span class="ms-label">Participation</span></div>
      <div class="mini-stat"><span class="ms-val">${trackData.best || '--'}</span><span class="ms-label">Best Month</span></div>
    `;
  }

  if (trendCanvas) {
    if (charts['c-mood-trend']) charts['c-mood-trend'].destroy();
    const labels = trackData.xCategory || [];
    const values = trackData.mood || [];
    if (labels.length && values.length) {
      charts['c-mood-trend'] = new Chart(trendCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Mood Score', data: values, borderColor: '#6c5ce7', backgroundColor: 'rgba(108,92,231,.15)', fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: '#6c5ce7', borderWidth: 2.5 }] },
        options: { responsive: true, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1c26', titleColor: '#e4e6ef', bodyColor: '#e4e6ef', borderColor: '#2a2d3a', borderWidth: 1, padding: 10, displayColors: false, callbacks: { label: (c) => `Mood: ${c.parsed.y}%` } } }, scales: { x: { ticks: { color: '#6b7087', font: { size: 10 } }, grid: { color: 'rgba(42,45,58,.5)' } }, y: { ticks: { color: '#6b7087', font: { size: 10 } }, grid: { color: 'rgba(42,45,58,.5)' }, min: 0, max: 100 } } }
      });
    }
  }

  if (distCanvas) {
    if (charts['c-mood-dist']) charts['c-mood-dist'].destroy();
    const dist = recData.moodDistribution || [];
    if (dist.length) {
      const moodLabels = ['😢 1', '😕 2', '😐 3', '😊 4', '😄 5'];
      const labels = dist.map((d, i) => moodLabels[i] || `${d.mood_value}`);
      const values = dist.map(d => (d.distribution || []).reduce((a, b) => a + b, 0));
      const colors = ['#ff7675', '#e17055', '#fdcb6e', '#55efc4', '#00cec9'];
      charts['c-mood-dist'] = new Chart(distCanvas, {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, values.length), borderRadius: 6 }] },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1c26', titleColor: '#e4e6ef', bodyColor: '#e4e6ef', borderColor: '#2a2d3a', borderWidth: 1, padding: 10, displayColors: false, callbacks: { label: (c) => `${c.parsed.x} entries` } } }, scales: { x: { ticks: { color: '#6b7087', font: { size: 10 } }, grid: { color: 'rgba(42,45,58,.5)' } }, y: { ticks: { color: '#e4e6ef', font: { size: 12 } }, grid: { display: false } } } }
      });
    }
  }

  if (sowhat) {
    const avgVal = parseFloat(meterData.percentageAverageMood);
    if (!isNaN(avgVal)) {
      sowhat.innerHTML = avgVal < 60
        ? `<strong>Low mood alert:</strong> Average mood is ${avgVal}% — below healthy threshold. Consider a wellbeing check-in.`
        : `<strong>Mood is healthy</strong> at ${avgVal}%. Keep monitoring for trends.`;
    } else {
      sowhat.innerHTML = '<strong>Tip:</strong> Increase mood tracking participation to get meaningful insights.';
    }
  }
}

// --- 4. Recognition Feed ---
function renderRecognitionFeed(rRecent, rTop) {
  const feedEl = document.getElementById('recog-feed-list');
  const lbEl = document.getElementById('recog-leaderboard');
  if (!feedEl) return;

  const rawItems = rRecent?.data || rRecent?.recognitions || (Array.isArray(rRecent) ? rRecent : []);
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (!items.length) { feedEl.innerHTML = '<span class="text-muted">No recent recognitions</span>'; }
  else {
    const avatarColors = ['#6c5ce7', '#00cec9', '#fdcb6e', '#ff7675', '#a29bfe', '#55efc4'];
    feedEl.innerHTML = items.slice(0, 15).map((r, i) => {
      const sender = r.senderName || r.sender?.name || 'Someone';
      const receiver = r.receiverName || r.receiver?.name || 'Someone';
      const value = (r.recognitionValues || [])[0] || r.value || '';
      const coins = r.coins || r.coinsGiven || 0;
      const time = r.recognizedAt || '';
      const initial = sender.charAt(0).toUpperCase();
      return `<div class="recog-card">
        <div class="avatar-circle" style="background:${avatarColors[i % avatarColors.length]}">${initial}</div>
        <div class="recog-card-body">
          <div class="recog-card-names">${sender} → ${receiver}</div>
          <div class="recog-card-meta">
            ${value ? `<span class="recog-value-pill">${value.replace(/-/g, ' ')}</span>` : ''}
            ${coins ? `<span>🪙 ${coins}</span>` : ''}
            ${time ? `<span>${time}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  if (lbEl) {
    const topReceivers = rTop?.topReceivers || rTop?.receivers || [];
    const topGivers = rTop?.topGivers || rTop?.givers || [];
    let html = '';
    if (topReceivers.length) {
      html += '<h5>Top Receivers</h5>';
      html += topReceivers.slice(0, 5).map((u, i) => `<div class="lb-row"><span class="lb-rank">${i + 1}</span><span class="lb-name">${u.receiverName || u.name || 'User'}</span><span class="lb-count">${u.totalRecognitionReceived || u.count || 0}</span></div>`).join('');
    }
    if (topGivers.length) {
      html += '<h5 style="margin-top:16px">Top Givers</h5>';
      html += topGivers.slice(0, 5).map((u, i) => `<div class="lb-row"><span class="lb-rank">${i + 1}</span><span class="lb-name">${u.senderName || u.name || 'User'}</span><span class="lb-count">${u.totalRecognitionGiven || u.count || 0}</span></div>`).join('');
    }
    lbEl.innerHTML = html || '<span class="text-muted">No leaderboard data</span>';
  }
}

// --- 5. Coins Economy ---
function renderCoinsEconomy(cIns, gCards) {
  const kpis = document.getElementById('coins-kpis');
  const canvas = document.getElementById('c-coins-full');
  const giftEl = document.getElementById('gift-stats');

  const earned = (cIns?.earnedCoins || []).map(v => parseInt(v) || 0);
  const donated = (cIns?.donatedCoins || []).map(v => parseInt(v) || 0);
  const totalEarned = earned.reduce((a, b) => a + b, 0);
  const totalDonated = donated.reduce((a, b) => a + b, 0);

  if (kpis) {
    const giftCount = gCards?.totalGiftCards || gCards?.totalCards || 0;
    kpis.innerHTML = `
      <div class="mini-stat"><span class="ms-val">${totalEarned.toLocaleString()}</span><span class="ms-label">Earned</span></div>
      <div class="mini-stat"><span class="ms-val">${totalDonated.toLocaleString()}</span><span class="ms-label">Donated</span></div>
      <div class="mini-stat"><span class="ms-val">${giftCount}</span><span class="ms-label">Gift Cards</span></div>
    `;
  }

  if (canvas && (earned.length || donated.length)) {
    if (charts['c-coins-full']) charts['c-coins-full'].destroy();
    const labels = earned.map((_, i) => `M${i + 1}`);
    charts['c-coins-full'] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Earned', data: earned, borderColor: '#6c5ce7', backgroundColor: 'rgba(108,92,231,.15)', fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: '#6c5ce7', borderWidth: 2.5 },
          { label: 'Donated', data: donated, borderColor: '#00cec9', backgroundColor: 'rgba(0,206,201,.08)', borderDash: [5, 3], fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: '#00cec9', borderWidth: 2.5 }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#e4e6ef', font: { size: 11 }, boxWidth: 14, padding: 16 } },
          tooltip: { backgroundColor: '#1a1c26', titleColor: '#e4e6ef', bodyColor: '#e4e6ef', borderColor: '#2a2d3a', borderWidth: 1, padding: 10, callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toLocaleString()} coins` } }
        },
        scales: { x: { ticks: { color: '#6b7087', font: { size: 10 } }, grid: { color: 'rgba(42,45,58,.5)' } }, y: { ticks: { color: '#6b7087', font: { size: 10 } }, grid: { color: 'rgba(42,45,58,.5)' }, beginAtZero: true } }
      }
    });
  }

  if (giftEl && gCards) {
    const redeemed = gCards?.totalGiftCardsRedeemed || gCards?.redeemed || 0;
    const totalCoinsUsed = parseInt(gCards?.totalCoins) || 0;
    giftEl.innerHTML = `<span class="text-muted" style="font-size:11px">🎁 ${redeemed} redeemed · ${totalCoinsUsed.toLocaleString()} coins used on gift cards</span>`;
  }
}

// --- 6. Productivity ---
function renderProductivity(aiProd) {
  const wpCanvas = document.getElementById('c-work-personal');
  const actCanvas = document.getElementById('c-actions-trend');
  const burnoutEl = document.getElementById('burnout-indicator');
  const sowhat = document.getElementById('productivity-sowhat');

  const workPct = aiProd?.hiddenCompanionMetric?.workHoursPercent || aiProd?.workPercentage || 59;
  const personalPct = aiProd?.hiddenCompanionMetric?.personalTimePercent || aiProd?.personalPercentage || 41;

  if (wpCanvas) {
    if (charts['c-work-personal']) charts['c-work-personal'].destroy();
    charts['c-work-personal'] = new Chart(wpCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Work', 'Personal'],
        datasets: [{ data: [workPct, personalPct], backgroundColor: ['#6c5ce7', '#00cec9'], borderWidth: 0 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#6b7087', font: { size: 10 }, boxWidth: 10 } } }, cutout: '60%' }
    });
  }

  if (actCanvas) {
    if (charts['c-actions-trend']) charts['c-actions-trend'].destroy();
    const trend = aiProd?.actionsTrend || aiProd?.weeklyActions || [];
    if (Array.isArray(trend) && trend.length) {
      const labels = trend.map((t, i) => t.weekLabel || t.week || `W${i + 1}`);
      const values = trend.map(t => t.actions || t.count || t.value || 0);
      charts['c-actions-trend'] = new Chart(actCanvas, {
        type: 'bar',
        data: { labels, datasets: [{ data: values, backgroundColor: 'rgba(108,92,231,.5)', borderRadius: 4 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#6b7087', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#6b7087', font: { size: 9 } }, grid: { color: '#1a1c26' }, beginAtZero: true } } }
      });
    }
  }

  if (burnoutEl) {
    const burnoutCard = aiProd?.insightCards?.burnoutRisk;
    const risk = burnoutCard?.show ? 'high' : 'low';
    const riskLower = risk.toLowerCase();
    const riskClass = riskLower.includes('high') ? 'high' : riskLower.includes('mod') ? 'moderate' : 'low';
    const riskLabel = riskClass === 'high' ? '🔴 High Burnout Risk' : riskClass === 'moderate' ? '🟡 Moderate Burnout Risk' : '🟢 Low Burnout Risk';
    burnoutEl.innerHTML = `<span class="burnout-badge ${riskClass}">${riskLabel}</span>`;
  }

  if (sowhat) {
    sowhat.innerHTML = `<strong>Usage split:</strong> ${workPct}% work / ${personalPct}% personal. ${workPct > 90 ? 'Consider promoting personal wellness features.' : 'Good balance between work and personal wellness.'}`;
  }
}

// --- 7. Success Tracker ---
function renderSuccessTracker(aiIns) {
  const el = document.getElementById('success-tracker-bars');
  if (!el) return;
  const metrics = aiIns?.successMetrics?.metrics || [];
  if (!metrics.length) { el.innerHTML = '<span class="text-muted">No success metrics data</span>'; return; }

  el.innerHTML = metrics.map(m => {
    const cur = parseFloat(m.currentValue) || parseFloat(m.current) || 0;
    const tgt = parseFloat(m.targetValue) || parseFloat(m.target) || 1;
    const pct = tgt > 0 ? Math.min(Math.round((cur / tgt) * 100), 100) : 0;
    const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--yellow)' : 'var(--red)';
    const name = m.metricName || m.metric || '';
    return `<div class="success-bar-row">
      <div class="success-bar-header"><span class="sb-label">${name}</span><span class="sb-vals">${m.currentValue || m.current} / ${m.targetValue || m.target} target</span></div>
      <div class="success-bar-track"><div class="success-bar-fill" style="width:${pct}%;background:${color}"><span class="success-bar-pct">${pct}%</span></div></div>
    </div>`;
  }).join('');
}

// --- 8. People Table ---
let _allUsers = [];
function renderPeopleTable(uList) {
  const tbody = document.getElementById('people-tbody');
  const countEl = document.getElementById('people-count');
  if (!tbody) return;

  const users = Array.isArray(uList) ? uList : (uList?.users || uList?.data || []);
  _allUsers = users;
  if (countEl) countEl.textContent = `${users.length} users`;
  fillPeopleRows(users);
}

function fillPeopleRows(users) {
  const tbody = document.getElementById('people-tbody');
  if (!tbody) return;
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:20px">No users found</td></tr>'; return; }

  tbody.innerHTML = users.slice(0, 100).map(u => {
    const name = u.fullName || u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown';
    const tenant = u.tenantName || u.companyName || _currentTenantName || '--';
    const status = u.accountStatus || u.status || 'pending';
    const sLow = status.toLowerCase();
    const statusClass = (sLow.includes('active') && !sLow.includes('deactivat')) ? 'active' : sLow.includes('pending') || sLow.includes('invited') ? 'pending' : 'inactive';
    const role = u.jobTitle || u.role || '--';
    const lastLogin = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '--';
    const joined = (u.dateJoined || u.createdAt) ? new Date(u.dateJoined || u.createdAt).toLocaleDateString() : '--';
    return `<tr>
      <td><strong>${name}</strong></td>
      <td>${tenant}</td>
      <td><span class="status-badge ${statusClass}">${status}</span></td>
      <td>${role}</td>
      <td>${lastLogin}</td>
      <td>${joined}</td>
    </tr>`;
  }).join('');
}

function filterPeople() {
  const q = (document.getElementById('people-search')?.value || '').toLowerCase();
  const filtered = q ? _allUsers.filter(u => {
    const name = (u.fullName || u.name || `${u.firstName || ''} ${u.lastName || ''}`).toLowerCase();
    return name.includes(q);
  }) : _allUsers;
  fillPeopleRows(filtered);
  const countEl = document.getElementById('people-count');
  if (countEl) countEl.textContent = `${filtered.length} users`;
}

// --- 9. (Tenant Switcher removed — now using header dropdown) ---

// ---- Custom Question ----
async function askCustom() {
  const q = document.getElementById('custom-q').value.trim();
  if (!q) return;
  const el = document.getElementById('custom-answer');
  el.innerHTML = '<div class="spinner" style="margin:12px auto"></div>';

  const rawData = window._rawData || {};
  const context = JSON.stringify(rawData, null, 2).slice(0, 8000);
  const res = await ChoysAPI.analyzeWithAI(q, context);

  if (res.error) { el.innerHTML = `<span style="color:var(--red)">${res.message}</span>`; return; }
  el.innerHTML = marked.parse(res.content);
}

// ===========================================================
//  CHAT AGENT — Guided + AI Hybrid
// ===========================================================

const SYSTEM_PROMPT = `You are the Choys Onboarding Agent — warm, fun, and smart. Think of yourself as a friendly wellness coach who also happens to be great at data.

Context: The user is going through a guided onboarding for Choys (employee wellness platform). You've already collected structured data about their company through interactive cards and chips. Now you're helping them refine and generating program suggestions.

When generating programs, format EACH as:
**[Program Name]** _(type)_
⏱ Duration | 🎯 Target participation
What it does in 1-2 sentences.
💡 **Why this fits:** specific reason for THIS company.

Suggest 4-6 programs. Use Choys features: mood tracking, step challenges, habit tracking, peer recognition, team challenges, duel challenges, PERMA surveys, campaigns, leaderboards, coins/rewards, interest clubs, meditation timers, donation campaigns.

End by saying something encouraging and mention the **AI Program Builder** will build these out with schedules, content, and milestones.

Be playful but professional. Use emoji sparingly. Markdown formatting.`;

const chatState = {
  started: false,
  step: 0,
  messages: [{ role: 'system', content: SYSTEM_PROMPT }],
  data: { goals: [], painPoints: [], size: '', industry: '', arrangement: '' }
};

const STEPS = [
  { id: 'welcome', progress: 0 },
  { id: 'company', progress: 15 },
  { id: 'industry', progress: 30 },
  { id: 'goals', progress: 50 },
  { id: 'pain', progress: 65 },
  { id: 'team', progress: 80 },
  { id: 'analyze', progress: 95 },
  { id: 'done', progress: 100 }
];

function setProgress(pct) {
  const bar = document.getElementById('chat-progress');
  if (bar) bar.style.width = pct + '%';
}

function startChat() {
  chatState.started = true;
  chatState.step = 0;
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  clearOptions();
  setProgress(0);
  showWelcome();
}

function resetChat() {
  chatState.started = false;
  chatState.step = 0;
  chatState.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  chatState.data = { goals: [], painPoints: [], size: '', industry: '', arrangement: '' };
  startChat();
}

// ---- Message Helpers ----
function addAgentMessage(text, skipHistory) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg agent';
  div.innerHTML = `<div class="msg-content">${marked.parse(text)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  if (!skipHistory) chatState.messages.push({ role: 'assistant', content: text });
}

function addAgentHTML(html) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg agent';
  div.innerHTML = `<div class="msg-content">${html}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addUserMessage(text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  chatState.messages.push({ role: 'user', content: text });
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg-typing'; div.id = 'typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}
function hideTyping() { document.getElementById('typing-indicator')?.remove(); }
function showOptions(opts) {
  document.getElementById('chat-options').innerHTML = opts.map(o =>
    `<div class="chat-option" onclick="selectOption(this)">${o}</div>`
  ).join('');
}
function clearOptions() { document.getElementById('chat-options').innerHTML = ''; }
function selectOption(el) { clearOptions(); sendMessage(el.textContent); }
function handleChatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserMessage(); } }
function sendUserMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  clearOptions();
  sendMessage(text);
}

// ---- Step 0: Welcome ----
function showWelcome() {
  addAgentHTML(`
    <div class="welcome-card">
      <h3>Hey there! 👋 Welcome to Choys</h3>
      <div class="wc-time">⚡ Takes about 5 minutes — then we'll suggest programs tailored just for you</div>
      <p style="font-size:13px;color:var(--text);margin-bottom:12px">I'm your AI wellness strategist. I'll ask a few questions about your company, understand what your team needs, and design a custom program package.</p>
      <div class="welcome-steps">
        <div class="welcome-step"><span class="ws-num">1</span><span class="ws-label">Your Company</span></div>
        <div class="welcome-step"><span class="ws-num">2</span><span class="ws-label">Goals & Vibes</span></div>
        <div class="welcome-step"><span class="ws-num">3</span><span class="ws-label">Team Setup</span></div>
        <div class="welcome-step"><span class="ws-num">4</span><span class="ws-label">AI Programs</span></div>
      </div>
    </div>
  `);
  setTimeout(() => {
    addAgentMessage("Let's kick things off! **What's your company name?** 🏢", true);
    showOptions(["Let me type it", "Skip — just exploring"]);
  }, 600);
  chatState.step = 1;
  setProgress(15);
}

// ---- Step Flow ----
async function sendMessage(text) {
  addUserMessage(text);
  const step = chatState.step;

  if (step === 1) {
    chatState.data.name = text;
    chatState.step = 2;
    setProgress(30);
    showIndustryCards();
  } else if (step === 2) {
    chatState.data.industry = text;
    chatState.step = 3;
    setProgress(40);
    showSizeCards();
  } else if (step === 3) {
    chatState.data.size = text;
    chatState.step = 4;
    setProgress(50);
    showGoalChips();
  } else if (step === 4) {
    chatState.step = 5;
    setProgress(65);
    showPainChips();
  } else if (step === 5) {
    chatState.step = 6;
    setProgress(80);
    showTeamCards();
  } else if (step === 6) {
    chatState.data.arrangement = text;
    chatState.step = 7;
    setProgress(90);
    addAgentMessage("Love it! I've got everything I need. Let me cook up some programs... 🧑‍🍳✨", true);
    await generatePrograms();
  } else {
    showTyping();
    const res = await ChoysAPI.chatWithAI([...chatState.messages], { maxTokens: 1500 });
    hideTyping();
    if (res.error) {
      addAgentMessage(`Oops: *${res.message}*\n\nCheck the OpenAI key in Settings.`);
    } else {
      addAgentMessage(res.content);
      if (res.content.toLowerCase().includes('program builder') || res.content.includes('Duration')) {
        showHandoff();
      }
    }
  }
}

function showIndustryCards() {
  addAgentMessage(`Nice! **${chatState.data.name}** — let's get to know you better.\n\nWhat industry are you in? Pick one 👇`, true);
  addAgentHTML(`
    <div class="select-cards cols-3">
      <div class="select-card" onclick="pickCard(this,'industry')"><span class="sc-emoji">☕</span><span class="sc-title">Food & Bev</span><span class="sc-desc">Restaurants, cafes, F&B chains</span></div>
      <div class="select-card" onclick="pickCard(this,'industry')"><span class="sc-emoji">💻</span><span class="sc-title">Technology</span><span class="sc-desc">Software, SaaS, IT services</span></div>
      <div class="select-card" onclick="pickCard(this,'industry')"><span class="sc-emoji">🏦</span><span class="sc-title">Finance</span><span class="sc-desc">Banking, insurance, fintech</span></div>
      <div class="select-card" onclick="pickCard(this,'industry')"><span class="sc-emoji">🏥</span><span class="sc-title">Healthcare</span><span class="sc-desc">Hospitals, clinics, pharma</span></div>
      <div class="select-card" onclick="pickCard(this,'industry')"><span class="sc-emoji">🛍️</span><span class="sc-title">Retail</span><span class="sc-desc">Stores, e-commerce, FMCG</span></div>
      <div class="select-card" onclick="pickCard(this,'industry')"><span class="sc-emoji">🎓</span><span class="sc-title">Education</span><span class="sc-desc">Schools, universities, edtech</span></div>
    </div>
  `);
  showOptions(["Something else"]);
}

function showSizeCards() {
  addAgentMessage(`Got it — **${chatState.data.industry}** space! 🔥\n\nHow big is the team?`, true);
  addAgentHTML(`
    <div class="select-cards cols-3">
      <div class="select-card" onclick="pickCard(this,'size')"><span class="sc-emoji">🌱</span><span class="sc-title">1-50</span><span class="sc-desc">Small & mighty</span></div>
      <div class="select-card" onclick="pickCard(this,'size')"><span class="sc-emoji">🌿</span><span class="sc-title">51-200</span><span class="sc-desc">Growing fast</span></div>
      <div class="select-card" onclick="pickCard(this,'size')"><span class="sc-emoji">🌳</span><span class="sc-title">201-500</span><span class="sc-desc">Mid-size org</span></div>
      <div class="select-card" onclick="pickCard(this,'size')"><span class="sc-emoji">🏔️</span><span class="sc-title">501-1000</span><span class="sc-desc">Large company</span></div>
      <div class="select-card" onclick="pickCard(this,'size')"><span class="sc-emoji">🌍</span><span class="sc-title">1000+</span><span class="sc-desc">Enterprise scale</span></div>
    </div>
  `);
}

function showGoalChips() {
  addAgentMessage(`**${chatState.data.size}** people — awesome.\n\nNow the fun part! What does your HR team want to achieve? **Pick all that apply** 👇`, true);
  addAgentHTML(`
    <div class="chip-group" id="goal-chips">
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">📈</span> Increase participation <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🤝</span> Team bonding <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🧘</span> Mental wellness <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">💪</span> Physical health <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🏆</span> Recognition culture <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">📊</span> Better retention <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">⚡</span> Boost productivity <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🌱</span> Company culture <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🌍</span> ESG / Sustainability <span class="chip-check">✓</span></div>
    </div>
    <button class="btn btn-primary btn-sm chip-confirm" onclick="confirmGoals()">Continue with selected →</button>
  `);
}

function toggleChip(el) { el.classList.toggle('selected'); }

function confirmGoals() {
  const selected = [...document.querySelectorAll('#goal-chips .chip.selected')].map(c =>
    c.textContent.replace('✓', '').trim()
  );
  if (!selected.length) { alert('Pick at least one goal!'); return; }
  chatState.data.goals = selected;
  addUserMessage(selected.join(', '));
  chatState.step = 5;
  setProgress(65);
  showPainChips();
}

function showPainChips() {
  addAgentMessage(`Great picks! 🎯\n\nAnything bugging you right now? **Select the challenges you're facing:**`, true);
  addAgentHTML(`
    <div class="chip-group" id="pain-chips">
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">😴</span> Low engagement <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🚪</span> High turnover <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🏝️</span> Remote disconnect <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">😓</span> Burnout concerns <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🤷</span> No wellness data <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">💤</span> Boring programs <span class="chip-check">✓</span></div>
      <div class="chip" onclick="toggleChip(this)"><span class="chip-emoji">🆕</span> Just starting out <span class="chip-check">✓</span></div>
    </div>
    <button class="btn btn-primary btn-sm chip-confirm" onclick="confirmPains()">Continue →</button>
  `);
  showOptions(["None of these — we're good!", "I'll type my own"]);
}

function confirmPains() {
  const selected = [...document.querySelectorAll('#pain-chips .chip.selected')].map(c =>
    c.textContent.replace('✓', '').trim()
  );
  chatState.data.painPoints = selected;
  addUserMessage(selected.length ? selected.join(', ') : 'No major pain points');
  chatState.step = 6;
  setProgress(80);
  showTeamCards();
}

function showTeamCards() {
  addAgentMessage(`Almost there! 🏁\n\nHow does your team work day-to-day?`, true);
  addAgentHTML(`
    <div class="select-cards">
      <div class="select-card" onclick="pickCard(this,'team')"><span class="sc-emoji">🏢</span><span class="sc-title">Fully On-site</span><span class="sc-desc">Everyone comes to the office</span></div>
      <div class="select-card" onclick="pickCard(this,'team')"><span class="sc-emoji">🏠</span><span class="sc-title">Fully Remote</span><span class="sc-desc">Distributed team, work from anywhere</span></div>
      <div class="select-card" onclick="pickCard(this,'team')"><span class="sc-emoji">🔄</span><span class="sc-title">Hybrid</span><span class="sc-desc">Mix of office and remote days</span></div>
      <div class="select-card" onclick="pickCard(this,'team')"><span class="sc-emoji">🚗</span><span class="sc-title">Field / Distributed</span><span class="sc-desc">Teams spread across locations (stores, sites)</span></div>
    </div>
  `);
}

function pickCard(el, type) {
  el.parentElement.querySelectorAll('.select-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const val = el.querySelector('.sc-title').textContent;
  setTimeout(() => { sendMessage(val); }, 400);
}

async function generatePrograms() {
  showTyping();
  setProgress(95);

  const d = chatState.data;
  const context = `Company: ${d.name || 'Unknown'}
Industry: ${d.industry || 'Not specified'}
Size: ${d.size || 'Not specified'}
Goals: ${d.goals.join(', ') || 'General wellness'}
Pain Points: ${d.painPoints.join(', ') || 'None specified'}
Work Arrangement: ${d.arrangement || 'Not specified'}`;

  chatState.messages.push({ role: 'user', content: `Here's my company profile:\n${context}\n\nPlease suggest 4-6 tailored wellness programs for us!` });

  const res = await ChoysAPI.chatWithAI([...chatState.messages], { maxTokens: 2000 });
  hideTyping();
  setProgress(100);

  if (res.error) {
    addAgentMessage(`Hmm, hit a snag: *${res.message}*\n\nCheck the OpenAI key in Settings (← Back → Settings).`);
    return;
  }

  addAgentMessage(res.content);
  showHandoff();
  showOptions(["Love these! 🎉", "Can you tweak them?", "Show me different options"]);
}

function showHandoff() {
  setTimeout(() => {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg agent';
    div.innerHTML = `<div class="handoff-chat">
      <h4>🚀 Ready to bring these to life?</h4>
      <p>The <strong>AI Program Builder</strong> will create detailed schedules, challenges, content & milestones from these suggestions.</p>
      <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="alert('Handoff to AI Program Builder — integration point. The collected company data and program suggestions would be passed to the builder.')">Launch AI Program Builder →</button>
    </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }, 600);
}

// ---- Init ----
(function() {
  // Load OpenAI key from Vercel env (injected via env.js) or localStorage
  if (!ChoysAPI.openaiKey && window.__ENV__?.OPENAI_API_KEY) {
    ChoysAPI.openaiKey = window.__ENV__.OPENAI_API_KEY;
    localStorage.setItem('choys_openai_key', ChoysAPI.openaiKey);
  }
  syncSettingsUI();
  updateDashAuth();
  initEnvSelector();
})();
