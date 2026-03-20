// === Choys Intelligence App ===

// ---- Screen Navigation ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goHome() { showScreen('landing'); }
function enterExisting() {
  if (ChoysAPI.isConnected()) {
    showScreen('dashboard-screen');
    loadIntelligence();
  } else {
    showScreen('login-screen');
  }
}
function enterNew() { showScreen('chat-screen'); if (!chatState.started) startChat(); }
function enterPerma() { showScreen('perma-screen'); initPermaPage(); }

// ---- Login Flow ----
function onLoginEnvChange() {
  const env = document.getElementById('login-env')?.value || 'dev';
  ChoysAPI.setEnv(env);
  // Also sync dashboard env selector
  const dashEnv = document.getElementById('env-select');
  if (dashEnv) dashEnv.value = env;
}

async function loginSendOTP() {
  const email = document.getElementById('login-email')?.value?.trim();
  if (!email) { setLoginStatus('Please enter your email', 'red'); return; }
  const btn = document.getElementById('btn-send-otp');
  btn.textContent = 'Sending...'; btn.disabled = true;
  const env = document.getElementById('login-env')?.value || 'dev';
  ChoysAPI.setEnv(env);
  const res = await ChoysAPI.sendOTP(email);
  btn.textContent = 'Send OTP'; btn.disabled = false;
  if (res.error || res.statusCode >= 400) {
    setLoginStatus(res.message || 'Failed to send OTP', 'red');
  } else {
    setLoginStatus('OTP sent! Check your email.', 'green');
    document.getElementById('login-otp-section').style.display = 'block';
    document.getElementById('login-otp')?.focus();
  }
}

async function loginVerifyOTP() {
  const email = document.getElementById('login-email')?.value?.trim();
  const otp = document.getElementById('login-otp')?.value?.trim();
  if (!otp) { setLoginStatus('Enter the 6-digit code', 'red'); return; }
  const btn = document.getElementById('btn-verify-otp');
  btn.textContent = 'Verifying...'; btn.disabled = true;
  const res = await ChoysAPI.verifyOTP(email, otp);
  btn.textContent = 'Verify & Enter'; btn.disabled = false;
  if (res.data?.accessToken) {
    ChoysAPI.saveAuth(res.data.accessToken, res.data.refreshToken);
    setLoginStatus('Authenticated! Loading dashboard...', 'green');
    setTimeout(() => {
      showScreen('dashboard-screen');
      updateDashAuth(true);
      loadIntelligence();
    }, 500);
  } else {
    setLoginStatus(res.message || 'Invalid OTP', 'red');
  }
}

function setLoginStatus(msg, color) {
  const el = document.getElementById('login-status');
  if (el) el.innerHTML = `<span style="color:var(--${color})">${msg}</span>`;
}

function logout() {
  ChoysAPI.clearAuth();
  showScreen('landing');
}

function updateDashAuth(connected) {
  const el = document.getElementById('dash-auth');
  const c = connected ?? ChoysAPI.isConnected();
  el.innerHTML = `<span class="dot ${c ? 'green' : 'red'}"></span> ${c ? 'Connected' : 'Not Connected'}`;
}

// ---- Dashboard Tabs (simplified — only Intelligence now) ----
document.querySelectorAll('.dash-nav li').forEach(li => {
  li.addEventListener('click', () => {
    document.querySelectorAll('.dash-nav li').forEach(l => l.classList.remove('active'));
    li.classList.add('active');
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`tab-${li.dataset.tab}`);
    if (tab) tab.classList.add('active');
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

// ---- Environment Selector (Dashboard) ----
function onEnvChange() {
  const env = document.getElementById('env-select')?.value || 'dev';
  ChoysAPI.setEnv(env);
  ChoysAPI.clearAuth();
  // Redirect to login screen for new env
  const loginEnv = document.getElementById('login-env');
  if (loginEnv) loginEnv.value = env;
  document.getElementById('login-status').innerHTML = `<span style="color:var(--yellow)">Switched to ${env.toUpperCase()} — please sign in.</span>`;
  document.getElementById('login-otp-section').style.display = 'none';
  showScreen('login-screen');
}

function initEnvSelector() {
  const env = getCookie('choys_env') || 'dev';
  const dashSel = document.getElementById('env-select');
  const loginSel = document.getElementById('login-env');
  if (dashSel) dashSel.value = env;
  if (loginSel) loginSel.value = env;
}

// ---- Tenant Selector ----
let _tenantList = [];
let _currentTenantName = '';
let _authTenantName = ''; // The tenant this token is scoped to

function onTenantChange() {
  const sel = document.getElementById('tenant-select');
  const val = sel?.value;
  if (val === 'auth') {
    _currentTenantName = _authTenantName || 'Your Tenant';
    ChoysAPI.selectedTenantId = null;
  } else {
    const t = _tenantList.find(t => (t.id || t.tenantId) === val);
    _currentTenantName = t?.companyName || t?.name || 'Unknown';
    ChoysAPI.selectedTenantId = val;
  }
  loadIntelligence();
}

function populateTenantDropdown(tenants, authTenantName) {
  const sel = document.getElementById('tenant-select');
  if (!sel) return;
  if (authTenantName) _authTenantName = authTenantName;
  const currentVal = ChoysAPI.selectedTenantId || 'auth';
  _tenantList = Array.isArray(tenants) ? tenants : (tenants?.tenants || tenants?.data || []);
  const label = _authTenantName || 'Your Tenant';
  sel.innerHTML = `<option value="auth">${label} (Current)</option>`;
  _tenantList.forEach(t => {
    const name = t.companyName || t.name || 'Unknown';
    const id = t.id || t.tenantId || name;
    const expired = t.isExpired ? ' (Expired)' : '';
    sel.innerHTML += `<option value="${id}">${name}${expired}</option>`;
  });
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

  // Resolve auth tenant name (the tenant this token belongs to)
  // Temporarily clear tenant override so we get the AUTH tenant, not the selected one
  const savedTenantId = ChoysAPI.selectedTenantId;
  ChoysAPI.selectedTenantId = null;
  const tenantDetail = await ChoysAPI.getTenantDetail();
  ChoysAPI.selectedTenantId = savedTenantId;
  const td = tenantDetail?.data?.tenant || tenantDetail?.data || {};
  _authTenantName = td.companyName || td.name || 'Your Tenant';
  // Set current display name
  if (ChoysAPI.selectedTenantId) {
    const t = _tenantList.find(t => (t.id || t.tenantId) === ChoysAPI.selectedTenantId);
    if (t) _currentTenantName = t.companyName || t.name || 'Unknown';
  } else {
    _currentTenantName = _authTenantName;
  }

  // Re-render health headline now that we know the tenant name
  const updatedScore = computeHealthScore(stats, delta, aiIns, totalUsers, pendingUsers);
  document.getElementById('health-headline').textContent = updatedScore.headline;

  // Render phase 2 sections
  renderMoodInsights(mTrack, mRec, mMeter, mPart);
  renderRecognitionFeed(rRecent, rTop);
  renderCoinsEconomy(cIns, gCards);
  renderProductivity(aiProd);
  renderSuccessTracker(aiIns);
  renderPeopleTable(uList);
  populateTenantDropdown(tList, _authTenantName);

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

  const tn = _currentTenantName || 'your team';
  let headline, subline;
  if (score >= 70) {
    headline = `${tn} is thriving on Choys`;
    subline = 'Strong engagement across multiple features. Keep the momentum going!';
  } else if (score >= 40) {
    headline = `${tn} — good start, room to grow`;
    subline = 'Some features are getting traction. Focus on activating pending users and broadening feature use.';
  } else if (score > 0) {
    headline = `${tn} — early days, let's build momentum`;
    subline = 'The team is just getting started. Run a kickoff campaign to boost adoption.';
  } else {
    headline = `${tn} — no activity yet`;
    subline = 'Start onboarding users to see the wellness scorecard.';
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
          { label: 'Donated', data: donated, borderColor: '#00cec9', backgroundColor: 'rgba(232,103,60,.06)', borderDash: [5, 3], fill: true, tension: .4, pointRadius: 4, pointBackgroundColor: '#00cec9', borderWidth: 2.5 }
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

const SYSTEM_PROMPT = `You are Bo — Choys' AI Wellbeing Officer. You're sharp, strategic, and a little cheeky. Think of yourself as a culture consultant who's worked with 200+ companies.

Context: The user (an HR manager) is going through a guided onboarding for Choys (employee wellness platform). You're leading a strategic intake — not a boring form. You're helping them "Launch a Movement," not "set up an account."

When generating programs, format EACH as:
**[Program Name]** _(type)_
⏱ Duration | 🎯 Target participation
What it does in 1-2 sentences.
💡 **Why this fits:** specific reason for THIS company.

Suggest 4-6 programs. Use Choys features: mood tracking, step challenges, habit tracking, peer recognition, team challenges, duel challenges, PERMA surveys, campaigns, leaderboards, coins/rewards, interest clubs, meditation timers, donation campaigns.

End by saying something encouraging and mention the **AI Program Builder** will build these out with schedules, content, and milestones.

Be sharp but warm. Use emoji sparingly. Markdown formatting.`;

const chatState = {
  started: false,
  step: 0,
  messages: [{ role: 'system', content: SYSTEM_PROMPT }],
  data: { goals: [], painPoints: [], size: '', industry: '', arrangement: '' }
};

const STEP_LABELS = ['Discovery', 'Industry', 'Squad', 'Goals', 'Challenges', 'Environment', 'Blueprint', 'Verify', 'Launch'];

function setProgress(pct) {
  const bar = document.getElementById('chat-progress');
  if (bar) bar.style.width = pct + '%';
}

// --- Step indicator dots ---
function updateStepDots(currentStep) {
  const dots = document.querySelectorAll('.chat-step-dot');
  dots.forEach((dot, i) => {
    const step = i + 1;
    dot.classList.remove('done', 'active');
    if (step < currentStep) dot.classList.add('done');
    else if (step === currentStep) dot.classList.add('active');
  });
  const label = document.getElementById('chat-step-label');
  if (label && currentStep > 0 && currentStep <= STEP_LABELS.length) {
    label.textContent = STEP_LABELS[currentStep - 1];
  }
}

// --- Confetti ---
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = [];
  const colors = ['#6c5ce7', '#00cec9', '#fdcb6e', '#ff7675', '#a29bfe', '#55efc4', '#fab1a0'];
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - .5) * 200,
      y: canvas.height / 2,
      vx: (Math.random() - .5) * 12,
      vy: Math.random() * -14 - 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 6 + 3,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - .5) * 10,
      life: 1
    });
  }
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += .35;
      p.vx *= .99;
      p.rotation += p.rotSpeed;
      p.life -= .012;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .6);
      ctx.restore();
    });
    frame++;
    if (alive && frame < 120) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(draw);
}

// --- Milestone flash ---
function milestoneFlash() {
  const flash = document.createElement('div');
  flash.className = 'milestone-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 600);
}

// --- Celebration badge ---
function showCelebration(emoji, text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.style.cssText = 'align-self:center;animation:celebPop .5s cubic-bezier(.4,0,.2,1)';
  div.innerHTML = `<div class="celebration-badge"><span class="cb-emoji">${emoji}</span> ${text}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// --- Typewriter effect ---
function typewriterMessage(text, callback) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'msg agent';
  const content = document.createElement('div');
  content.className = 'msg-content';
  div.appendChild(content);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // Parse markdown first, then type it character by character
  const parsed = marked.parse(text);
  const temp = document.createElement('div');
  temp.innerHTML = parsed;
  const fullHTML = temp.innerHTML;

  // Simple approach: set innerHTML and animate opacity of inner elements
  content.innerHTML = fullHTML;
  content.style.opacity = '0';
  requestAnimationFrame(() => {
    content.style.transition = 'opacity .3s ease';
    content.style.opacity = '1';
  });

  chatState.messages.push({ role: 'assistant', content: text });
  container.scrollTop = container.scrollHeight;
  if (callback) setTimeout(callback, 400);
}

function startChat() {
  chatState.started = true;
  chatState.step = 0;
  const container = document.getElementById('chat-messages');
  container.innerHTML = '';
  clearOptions();
  setProgress(0);
  updateStepDots(0);
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
  const hasKey = !!ChoysAPI.openaiKey;
  addAgentHTML(`
    <div class="welcome-card">
      <h3>Hey! I'm Bo, your Wellbeing Officer 👨‍✈️</h3>
      <div class="wc-time">⚡ 3 min strategic intake — let's launch a movement for your team</div>
      <p style="font-size:13px;color:var(--text);margin-bottom:12px">I've helped 200+ companies build thriving wellness cultures. Answer a few sharp questions and I'll craft your blueprint.</p>
      <div class="welcome-steps" id="welcome-steps">
        <div class="welcome-step ws-active"><span class="ws-num">1</span><span class="ws-label">Discovery</span></div>
        <div class="welcome-step"><span class="ws-num">2</span><span class="ws-label">Blueprint</span></div>
        <div class="welcome-step"><span class="ws-num">3</span><span class="ws-label">Verify</span></div>
        <div class="welcome-step"><span class="ws-num">4</span><span class="ws-label">Launch</span></div>
      </div>
      ${!hasKey ? `<div style="margin-top:12px;padding:10px 12px;background:rgba(232,103,60,.06);border:1px solid rgba(232,103,60,.2);border-radius:8px">
        <div style="font-size:11px;color:#E8673C;margin-bottom:6px;display:flex;align-items:center;gap:4px"><span style="font-size:13px">🔑</span> Paste your OpenAI API key to enable AI features</div>
        <div style="display:flex;gap:6px">
          <input id="welcome-api-key" class="input" placeholder="sk-..." style="font-size:12px;flex:1">
          <button class="btn btn-primary btn-sm" onclick="saveWelcomeKey()">Save</button>
        </div>
        <div id="welcome-key-status" style="font-size:10px;margin-top:4px"></div>
      </div>` : ''}
    </div>
  `);
  setTimeout(() => {
    addAgentMessage("Let's kick things off! **What's your company name?** 🏢", true);
    showOptions(["Let me type it", "Skip — just exploring"]);
  }, 700);
  chatState.step = 1;
  setProgress(15);
  updateStepDots(1);
}

function saveWelcomeKey() {
  const input = document.getElementById('welcome-api-key');
  const status = document.getElementById('welcome-key-status');
  const key = input?.value?.trim();
  if (!key || !key.startsWith('sk-')) {
    if (status) status.innerHTML = '<span style="color:var(--red)">Please enter a valid key starting with sk-</span>';
    return;
  }
  ChoysAPI.openaiKey = key;
  if (status) status.innerHTML = '<span style="color:var(--green)">Key saved! AI features enabled.</span>';
  input.disabled = true;
}

// ---- Step Flow ----
async function sendMessage(text) {
  addUserMessage(text);
  const step = chatState.step;

  if (step === 1) {
    chatState.data.name = text;
    chatState.step = 2;
    setProgress(25);
    updateStepDots(2);
    milestoneFlash();
    await searchCompanyAndContinue(text);
  } else if (step === 2) {
    chatState.data.industry = text;
    chatState.step = 3;
    setProgress(40);
    updateStepDots(3);
    showSizeCards();
  } else if (step === 3) {
    chatState.data.size = text;
    chatState.step = 4;
    setProgress(50);
    updateStepDots(4);
    showCelebration('🔥', 'Halfway there! Keep going!');
    showGoalChips();
  } else if (step === 4) {
    chatState.step = 5;
    setProgress(65);
    updateStepDots(5);
    showPainChips();
  } else if (step === 5) {
    chatState.step = 6;
    setProgress(80);
    updateStepDots(6);
    showTeamCards();
  } else if (step === 6) {
    chatState.data.arrangement = text;
    chatState.step = 7;
    setProgress(90);
    updateStepDots(7);
    showCelebration('🚀', 'All info collected! Time for AI magic!');
    addAgentMessage("Love it! I've got everything I need. Let Bo cook up your blueprint... 🧑‍🍳✨", true);
    await generatePrograms();
  } else {
    showTyping();
    const res = await ChoysAPI.chatWithAI([...chatState.messages], { maxTokens: 1500 });
    hideTyping();
    if (res.error) {
      addAgentMessage(`Oops: *${res.message}*\n\nPaste your OpenAI key in the welcome card above.`);
    } else {
      addAgentMessage(res.content);
    }
  }
}

async function searchCompanyAndContinue(companyName) {
  // Skip AI search if no API key
  if (!ChoysAPI.openaiKey) {
    setProgress(30);
    showIndustryCards();
    return;
  }

  showTyping();

  // Try web search first, fall back to regular chat
  let searchRes = await ChoysAPI.chatWithAI([
    { role: 'system', content: 'You are a helpful assistant with knowledge of companies worldwide. Return ONLY a valid JSON object with these fields: industry (string, e.g. "Technology", "Food & Beverage", "Finance"), size_estimate (string, e.g. "51-200", "201-500", "1000+"), description (string, 2-3 sentence company summary including what they do, their market position, and key facts), headquarters (string, city and country), founded (string or null), key_products (string, comma separated list of main products/services), employee_count (string, approximate number), mission (string, 1 sentence about their mission/vision), found (boolean). If you cannot identify the company, set found to false.' },
    { role: 'user', content: `Search the web for the company "${companyName}" and return its details as JSON.` }
  ], { json: true, maxTokens: 600, webSearch: true });

  // Fallback to regular chat if web search fails
  if (searchRes.error) {
    searchRes = await ChoysAPI.chatWithAI([
      { role: 'system', content: 'You are a helpful assistant with knowledge of companies worldwide. Return ONLY a valid JSON object with these fields: industry (string), size_estimate (string, e.g. "51-200", "1000+"), description (string, 2-3 sentence company summary), headquarters (string), founded (string or null), key_products (string, main products/services), employee_count (string), mission (string, 1 sentence), found (boolean). If you cannot identify the company, set found to false.' },
      { role: 'user', content: `Tell me about the company "${companyName}". Return details as JSON.` }
    ], { json: true, maxTokens: 600 });
  }

  hideTyping();

  if (!searchRes.error) {
    try {
      const info = JSON.parse(searchRes.content);
      if (info.found !== false && info.description) {
        chatState.data.companyInfo = info;
        addAgentHTML(`
          <div class="welcome-card" style="border-color:rgba(232,103,60,.3);background:linear-gradient(135deg,rgba(232,103,60,.04),rgba(66,153,225,.03))">
            <h3 style="margin-bottom:8px">🔍 Here's what I found about <span style="color:#E8673C">${companyName}</span></h3>
            <p style="font-size:13px;margin-bottom:12px;color:var(--text);line-height:1.6">${info.description}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
              ${info.industry ? `<div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:8px;padding:8px 10px"><span style="font-size:10px;color:var(--muted);display:block">Industry</span><span style="font-size:13px;font-weight:600">${info.industry}</span></div>` : ''}
              ${info.employee_count || info.size_estimate ? `<div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:8px;padding:8px 10px"><span style="font-size:10px;color:var(--muted);display:block">Team Size</span><span style="font-size:13px;font-weight:600">${info.employee_count || '~' + info.size_estimate}</span></div>` : ''}
              ${info.headquarters ? `<div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:8px;padding:8px 10px"><span style="font-size:10px;color:var(--muted);display:block">Headquarters</span><span style="font-size:13px;font-weight:600">${info.headquarters}</span></div>` : ''}
              ${info.founded ? `<div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:8px;padding:8px 10px"><span style="font-size:10px;color:var(--muted);display:block">Founded</span><span style="font-size:13px;font-weight:600">${info.founded}</span></div>` : ''}
            </div>
            ${info.key_products ? `<div style="font-size:11px;color:var(--muted);margin-bottom:6px"><strong style="color:var(--text)">Key Products:</strong> ${info.key_products}</div>` : ''}
            ${info.mission ? `<div style="font-size:11px;color:var(--muted);font-style:italic">"${info.mission}"</div>` : ''}
          </div>
        `);

        // Pre-fill data from search
        if (info.industry) chatState.data.industry = info.industry;
        if (info.size_estimate) chatState.data.size = info.size_estimate;

        setTimeout(() => {
          addAgentMessage(`Got a good picture of **${companyName}**! Now let's tailor your wellness programs. 💪\n\nIs this the right industry? Pick or change below 👇`, true);
          setProgress(30);
          showIndustryCards();
        }, 800);
        return;
      }
    } catch (e) { /* JSON parse failed, fall through */ }
  }

  // Fallback: couldn't find, just continue normally
  setProgress(30);
  addAgentMessage(`Nice! **${companyName}** — I've worked with companies like yours before. Let's figure out what makes your team tick. 💪`, true);
  setTimeout(() => showIndustryCards(), 600);
}

function showIndustryCards() {
  addAgentMessage(`What industry are you in? Tap one 👇`, true);
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
  addAgentMessage(`**${chatState.data.industry}** — got it! 🔥 How many people are in your squad?`, true);
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
  addAgentMessage(`**${chatState.data.size}** people — solid squad!\n\nWhat's the #1 thing you want to move the needle on? **Pick all that apply** 👇`, true);
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

function toggleChip(el) {
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    el.style.transform = 'scale(1.08)';
    setTimeout(() => { el.style.transform = ''; }, 200);
  }
}

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
  addAgentMessage(`Great picks! 🎯\n\nWhat's the biggest **culture-killer** right now? Select what resonates:`, true);
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
  addAgentMessage(`Almost there! 🏁\n\nRemote, Hybrid, or In-office? How does your squad work?`, true);
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
  // Satisfying bounce
  el.style.transform = 'scale(.95)';
  setTimeout(() => { el.style.transform = 'scale(1.02)'; }, 100);
  setTimeout(() => { el.style.transform = ''; }, 250);
  const val = el.querySelector('.sc-title').textContent;
  setTimeout(() => { sendMessage(val); }, 500);
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

  // Build program list — try AI first, fallback to curated list
  let programs = [];

  if (ChoysAPI.openaiKey) {
    chatState.messages.push({ role: 'user', content: `Here's my company profile:\n${context}\n\nSuggest exactly 6 tailored wellness programs. For EACH program respond in this exact JSON format (array of objects): [{"emoji":"🧘","name":"Program Name","type":"Category","duration":"X weeks","desc":"One sentence description.","why":"One sentence why it fits this company."}]. Return ONLY the JSON array, no markdown.` });
    const res = await ChoysAPI.chatWithAI([...chatState.messages], { maxTokens: 2000 });
    if (!res.error) {
      try {
        const cleaned = res.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        programs = JSON.parse(cleaned);
      } catch (e) { /* parse failed, use fallback */ }
    }
  }

  // Fallback: curated programs based on collected data
  if (!programs.length) {
    const arr = d.arrangement || 'any';
    programs = [
      { emoji: '🧘', name: 'Mindfulness Mondays', type: 'Meditation', duration: '4 weeks', desc: `Weekly guided meditation & breathing sessions. 10 min via the Choys app.`, why: `Perfect for ${arr} teams to start the week centered and focused.` },
      { emoji: '🏆', name: 'Recognition Culture', type: 'Peer Recognition', duration: 'Ongoing', desc: `Peer-to-peer shoutouts with Choys coins. Celebrate wins daily.`, why: `Builds belonging & motivation across your ${d.size || ''} person team.` },
      { emoji: '🚶', name: 'Step Challenge', type: 'Fitness', duration: '30 days', desc: `Team step challenge with department leaderboards and prizes.`, why: `Drives physical health & friendly competition in ${d.industry || 'your industry'}.` },
      { emoji: '😊', name: 'Mood Pulse Check', type: 'Mood Tracking', duration: '6 weeks', desc: `Daily emoji mood check-in (5 seconds). Real-time sentiment data.`, why: `Gives HR instant wellness visibility without survey fatigue.` },
      { emoji: '🎯', name: 'Goal Getter', type: 'Goal Setting', duration: '8 weeks', desc: `Personal & team goal tracking with weekly check-ins and celebrations.`, why: `Aligns individual growth with ${d.name || 'company'} objectives.` },
      { emoji: '🤝', name: 'Coffee Roulette', type: 'Social Connection', duration: 'Ongoing', desc: `Random 1-on-1 matches for virtual or in-person coffee chats.`, why: `Breaks silos and builds cross-team relationships organically.` }
    ];
  }

  chatState.data.generatedPrograms = programs;

  hideTyping();
  setProgress(100);

  // Launch confetti celebration!
  launchConfetti();
  showCelebration('🎉', 'Your programs are ready!');

  addAgentMessage(`Here's your blueprint! **${programs.length} tailored programs** for **${d.name || 'your team'}** — pick the ones you want to launch 👇`, true);

  // Build selectable program cards
  setTimeout(() => {
    const cardsHTML = programs.map((p, i) => `
      <div class="program-card" onclick="toggleProgram(this, ${i})" data-idx="${i}">
        <div class="pc-header">
          <span class="pc-emoji">${p.emoji}</span>
          <div class="pc-check">✓</div>
        </div>
        <div class="pc-name">${p.name}</div>
        <div class="pc-type">${p.type} · ${p.duration}</div>
        <div class="pc-desc">${p.desc}</div>
        <div class="pc-why">💡 ${p.why}</div>
      </div>
    `).join('');

    addAgentHTML(`
      <div class="program-grid" id="program-grid">${cardsHTML}</div>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <button class="btn btn-primary btn-sm chip-confirm" onclick="confirmPrograms()">Launch Selected Programs →</button>
        <span style="font-size:11px;color:var(--muted)" id="program-count">0 selected</span>
      </div>
    `);
  }, 400);
}

function toggleProgram(el, idx) {
  el.classList.toggle('selected');
  // Satisfying bounce
  if (el.classList.contains('selected')) {
    el.style.transform = 'scale(1.03)';
    setTimeout(() => { el.style.transform = ''; }, 200);
  }
  const count = document.querySelectorAll('#program-grid .program-card.selected').length;
  const counter = document.getElementById('program-count');
  if (counter) counter.textContent = count ? `${count} selected` : '0 selected';
}

function confirmPrograms() {
  const selected = [...document.querySelectorAll('#program-grid .program-card.selected')];
  if (!selected.length) { alert('Pick at least one program!'); return; }
  const programs = chatState.data.generatedPrograms;
  const picked = selected.map(el => programs[parseInt(el.dataset.idx)]);
  chatState.data.selectedPrograms = picked;
  addUserMessage(picked.map(p => `${p.emoji} ${p.name}`).join(', '));
  // Next: pitch PERMA survey
  setTimeout(() => pitchPermaSurvey(), 600);
}

function pitchPermaSurvey() {
  addAgentMessage("Great picks! Before we launch, there's one more thing that'll make your programs **10x more powerful**... 🧠", true);

  setTimeout(() => {
    addAgentHTML(`
      <div class="welcome-card" style="border-color:rgba(232,103,60,.2);background:linear-gradient(135deg,rgba(232,103,60,.03),rgba(66,153,225,.03));max-width:100%">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div style="font-size:32px">🧠</div>
          <div>
            <h3 style="margin:0;font-size:16px">PERMA Wellbeing Survey</h3>
            <div style="font-size:11px;color:var(--muted)">by Dr. Martin Seligman — Father of Positive Psychology</div>
          </div>
        </div>

        <p style="font-size:13px;color:var(--text);margin-bottom:14px;line-height:1.6">Think of it as a <strong style="color:#E8673C">wellness health check</strong> for your team. PERMA measures 5 scientifically-validated pillars of human flourishing — so you don't just <em>run</em> programs, you <strong>measure their impact</strong>.</p>

        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:14px">
          <div style="background:rgba(243,156,18,.1);border:1px solid rgba(243,156,18,.3);border-radius:10px;padding:10px 6px;text-align:center">
            <div style="font-size:22px;font-weight:900;color:#f39c12">P</div>
            <div style="font-size:9px;color:var(--muted);line-height:1.3">Positive<br>Emotions</div>
          </div>
          <div style="background:rgba(52,152,219,.1);border:1px solid rgba(52,152,219,.3);border-radius:10px;padding:10px 6px;text-align:center">
            <div style="font-size:22px;font-weight:900;color:#3498db">E</div>
            <div style="font-size:9px;color:var(--muted);line-height:1.3">Engage-<br>ment</div>
          </div>
          <div style="background:rgba(155,89,182,.1);border:1px solid rgba(155,89,182,.3);border-radius:10px;padding:10px 6px;text-align:center">
            <div style="font-size:22px;font-weight:900;color:#9b59b6">R</div>
            <div style="font-size:9px;color:var(--muted);line-height:1.3">Relation-<br>ships</div>
          </div>
          <div style="background:rgba(26,188,156,.1);border:1px solid rgba(26,188,156,.3);border-radius:10px;padding:10px 6px;text-align:center">
            <div style="font-size:22px;font-weight:900;color:#1abc9c">M</div>
            <div style="font-size:9px;color:var(--muted);line-height:1.3">Mean-<br>ing</div>
          </div>
          <div style="background:rgba(46,204,113,.1);border:1px solid rgba(46,204,113,.3);border-radius:10px;padding:10px 6px;text-align:center">
            <div style="font-size:22px;font-weight:900;color:#2ecc71">A</div>
            <div style="font-size:9px;color:var(--muted);line-height:1.3">Accomplish-<br>ment</div>
          </div>
        </div>

        <div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;margin-bottom:8px">Why add PERMA to your programs?</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="font-size:11px;color:var(--muted);line-height:1.5">📊 <strong style="color:var(--text)">Measure impact</strong> — See if your programs actually move the needle on team wellbeing</div>
            <div style="font-size:11px;color:var(--muted);line-height:1.5">🎯 <strong style="color:var(--text)">Spot blind spots</strong> — Find which pillars need attention before burnout hits</div>
            <div style="font-size:11px;color:var(--muted);line-height:1.5">🤖 <strong style="color:var(--text)">AI insights</strong> — Get smart recommendations based on your team's unique flourishing profile</div>
            <div style="font-size:11px;color:var(--muted);line-height:1.5">⚡ <strong style="color:var(--text)">5 min survey</strong> — Fun emoji scales, not boring 1-10 forms. 84% avg response rate</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px">
          <div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#1abc9c">23</div>
            <div style="font-size:9px;color:var(--muted)">Questions</div>
          </div>
          <div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#3498db">5 min</div>
            <div style="font-size:9px;color:var(--muted)">Per Person</div>
          </div>
          <div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#9b59b6">84%</div>
            <div style="font-size:9px;color:var(--muted)">Avg Response</div>
          </div>
          <div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#2ecc71">Free</div>
            <div style="font-size:9px;color:var(--muted)">With Choys</div>
          </div>
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn perma-btn-primary btn-sm" onclick="acceptPerma()" style="flex:1">Yes, add PERMA Survey! 🧠</button>
          <button class="btn btn-secondary btn-sm" onclick="declinePerma()" style="flex:1">Skip for now</button>
        </div>
      </div>
    `);
  }, 600);
}

function acceptPerma() {
  chatState.data.perma = true;
  addUserMessage("Yes, add PERMA Survey! 🧠");
  addAgentMessage("Smart move! 🎯 PERMA Survey is locked in. Your team will get monthly wellbeing check-ins with AI-powered insights.\n\nBefore we launch, I need to **verify your business** — quick OTP check! 🔐", true);
  setTimeout(() => showOTPVerification(), 600);
}

function declinePerma() {
  chatState.data.perma = false;
  addUserMessage("Skip for now");
  addAgentMessage("No worries! You can always activate PERMA later from your dashboard.\n\nBefore we launch, I need to **verify your business** — quick OTP check! 🔐", true);
  setTimeout(() => showOTPVerification(), 600);
}

// ---- OTP Verification Step (Dummy FE) ----
function showOTPVerification() {
  addAgentHTML(`
    <div class="welcome-card" style="border-color:rgba(232,103,60,.3);background:linear-gradient(135deg,rgba(232,103,60,.04),rgba(232,103,60,.02));max-width:100%">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#E8673C,#d55a32);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff">🔐</div>
        <div>
          <h3 style="margin:0;font-size:16px">Verify Your Business</h3>
          <div style="font-size:11px;color:var(--muted)">Quick verification to activate your programs</div>
        </div>
      </div>

      <div id="otp-step-1">
        <p style="font-size:13px;color:var(--text);margin-bottom:12px;line-height:1.6">Enter your <strong>work email</strong> and we'll send a 6-digit verification code to confirm your identity.</p>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="otp-email" class="input" placeholder="you@company.com" style="flex:1;font-size:13px" type="email">
          <button class="btn btn-primary btn-sm" onclick="sendOTPCode()" id="otp-send-btn">Send Code</button>
        </div>
        <div id="otp-email-status" style="font-size:11px;margin-top:4px"></div>
      </div>

      <div id="otp-step-2" style="display:none">
        <p style="font-size:13px;color:var(--text);margin-bottom:12px;line-height:1.6">Enter the <strong>6-digit code</strong> sent to <span id="otp-email-display" style="color:#E8673C;font-weight:600"></span></p>
        <div style="display:flex;gap:6px;justify-content:center;margin-bottom:12px" id="otp-inputs">
          <input type="text" maxlength="1" class="otp-digit-input" oninput="otpDigitInput(this,0)" onkeydown="otpDigitKeydown(event,0)">
          <input type="text" maxlength="1" class="otp-digit-input" oninput="otpDigitInput(this,1)" onkeydown="otpDigitKeydown(event,1)">
          <input type="text" maxlength="1" class="otp-digit-input" oninput="otpDigitInput(this,2)" onkeydown="otpDigitKeydown(event,2)">
          <input type="text" maxlength="1" class="otp-digit-input" oninput="otpDigitInput(this,3)" onkeydown="otpDigitKeydown(event,3)">
          <input type="text" maxlength="1" class="otp-digit-input" oninput="otpDigitInput(this,4)" onkeydown="otpDigitKeydown(event,4)">
          <input type="text" maxlength="1" class="otp-digit-input" oninput="otpDigitInput(this,5)" onkeydown="otpDigitKeydown(event,5)">
        </div>
        <button class="btn btn-primary" onclick="verifyOTPCode()" id="otp-verify-btn" style="width:100%">Verify & Continue →</button>
        <div style="text-align:center;margin-top:8px">
          <span style="font-size:11px;color:var(--muted)">Didn't receive it? </span>
          <button class="btn btn-ghost btn-sm" onclick="resendOTPCode()" style="font-size:11px;color:#E8673C;padding:0">Resend code</button>
        </div>
        <div id="otp-verify-status" style="font-size:11px;margin-top:4px;text-align:center"></div>
      </div>
    </div>
  `);
}

function sendOTPCode() {
  const email = document.getElementById('otp-email')?.value?.trim();
  const status = document.getElementById('otp-email-status');
  if (!email || !email.includes('@')) {
    if (status) status.innerHTML = '<span style="color:var(--red)">Please enter a valid work email</span>';
    return;
  }
  const btn = document.getElementById('otp-send-btn');
  btn.textContent = 'Sending...'; btn.disabled = true;

  // Dummy: simulate sending OTP
  setTimeout(() => {
    btn.textContent = 'Sent ✓'; btn.style.background = 'var(--green)';
    if (status) status.innerHTML = '<span style="color:var(--green)">Code sent! Check your inbox</span>';
    document.getElementById('otp-step-2').style.display = 'block';
    document.getElementById('otp-email-display').textContent = email;
    chatState.data.verifiedEmail = email;
    // Auto-focus first digit
    document.querySelector('.otp-digit-input')?.focus();
  }, 1200);
}

function otpDigitInput(el, idx) {
  el.value = el.value.replace(/[^0-9]/g, '');
  if (el.value && idx < 5) {
    const inputs = document.querySelectorAll('.otp-digit-input');
    inputs[idx + 1]?.focus();
  }
}

function otpDigitKeydown(e, idx) {
  if (e.key === 'Backspace' && !e.target.value && idx > 0) {
    const inputs = document.querySelectorAll('.otp-digit-input');
    inputs[idx - 1]?.focus();
  }
}

function resendOTPCode() {
  const status = document.getElementById('otp-verify-status');
  if (status) status.innerHTML = '<span style="color:var(--green)">Code resent!</span>';
  setTimeout(() => { if (status) status.innerHTML = ''; }, 2000);
}

function verifyOTPCode() {
  const inputs = document.querySelectorAll('.otp-digit-input');
  const code = Array.from(inputs).map(i => i.value).join('');
  const status = document.getElementById('otp-verify-status');

  if (code.length < 6) {
    if (status) status.innerHTML = '<span style="color:var(--red)">Enter all 6 digits</span>';
    return;
  }

  const btn = document.getElementById('otp-verify-btn');
  btn.textContent = 'Verifying...'; btn.disabled = true;

  // Dummy: any 6-digit code works
  setTimeout(() => {
    btn.textContent = 'Verified ✓';
    btn.style.background = 'var(--green)';
    if (status) status.innerHTML = '<span style="color:var(--green)">Business verified successfully!</span>';
    inputs.forEach(i => { i.disabled = true; i.style.borderColor = 'var(--green)'; });

    chatState.data.verified = true;
    addUserMessage("Business verified ✓");
    launchConfetti();
    showCelebration('✅', 'Business Verified!');

    // Generate company code and show launch options
    setTimeout(() => showLaunchStep(), 800);
  }, 1500);
}

// ---- Launch Step: Company Code + Invite Team Options ----
function showLaunchStep() {
  const companyName = chatState.data.name || 'Company';
  const code = generateCompanyCode(companyName);
  chatState.data.companyCode = code;

  addAgentMessage(`You're verified! 🎉 Here's your unique **Company Code** — share it with your team so they can join your programs instantly.\n\nChoose how you want to onboard your squad 👇`, true);

  setTimeout(() => {
    addAgentHTML(`
      <div class="welcome-card" style="border-color:rgba(232,103,60,.3);max-width:100%">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Your Company Code</div>
          <div style="background:linear-gradient(135deg,rgba(232,103,60,.08),rgba(232,103,60,.03));border:2px dashed rgba(232,103,60,.4);border-radius:12px;padding:20px;display:inline-block;min-width:240px">
            <div id="company-code" style="font-size:32px;font-weight:900;letter-spacing:4px;color:#E8673C;font-family:monospace">${code}</div>
          </div>
          <div style="margin-top:10px">
            <button class="btn btn-primary btn-sm" onclick="copyCompanyCode()">📋 Copy Code</button>
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:8px">Employees download the Choys app → enter this code → they're in!</p>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:16px">
          <div style="font-size:13px;font-weight:700;margin-bottom:12px;text-align:center">How do you want to invite your team?</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <button class="btn btn-primary" onclick="showCompanyCodeLaunch()" style="padding:14px;flex-direction:column;gap:4px">
              <span style="font-size:22px">🚀</span>
              <span style="font-weight:700">Launch with Code</span>
              <span style="font-size:10px;opacity:.8">Share code + auto email sequence</span>
            </button>
            <button class="btn btn-secondary" onclick="showInviteTeamStep()" style="padding:14px;flex-direction:column;gap:4px">
              <span style="font-size:22px">📋</span>
              <span style="font-weight:700">Upload Team List</span>
              <span style="font-size:10px;opacity:.8">Download XL template & bulk invite</span>
            </button>
          </div>
        </div>
      </div>
    `);
  }, 500);
}

function generateCompanyCode(name) {
  const prefix = name.replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 4) || 'TEAM';
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${suffix}`;
}

function copyCompanyCode() {
  const code = chatState.data.companyCode;
  navigator.clipboard?.writeText(code);
  const btn = event.target.closest('button');
  btn.textContent = '✓ Copied!';
  setTimeout(() => { btn.innerHTML = '📋 Copy Code'; }, 2000);
}

function showCompanyCodeLaunch() {
  addUserMessage("Launch with Code 🚀");
  const code = chatState.data.companyCode;
  const d = chatState.data;
  const programNames = (d.selectedPrograms || []).map(p => p.emoji + ' ' + p.name).join(', ') || 'your programs';

  addAgentMessage(`Launching **${d.name || 'your company'}**! Here's what happens next:`, true);

  setTimeout(() => {
    addAgentHTML(`
      <div class="welcome-card" style="max-width:100%">
        <h3 style="margin-bottom:14px">🚀 Launch Sequence Activated</h3>

        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#E8673C,#d55a32);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">1</div>
            <div>
              <div style="font-size:13px;font-weight:600">Hour 0 — Teaser Email</div>
              <div style="font-size:11px;color:var(--muted)">A hype email goes to your team. No code yet — just excitement!</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#E8673C,#d55a32);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">2</div>
            <div>
              <div style="font-size:13px;font-weight:600">Hour 2 — Official Invite</div>
              <div style="font-size:11px;color:var(--muted)">The official email with Company Code <strong style="color:#E8673C">${code}</strong> + app download link</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#E8673C,#d55a32);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">3</div>
            <div>
              <div style="font-size:13px;font-weight:600">Employee Joins</div>
              <div style="font-size:11px;color:var(--muted)">Download app → Enter code → Boom, they're in ${programNames}</div>
            </div>
          </div>
        </div>

        <div style="background:rgba(232,103,60,.06);border:1px solid rgba(232,103,60,.2);border-radius:10px;padding:14px;margin-bottom:14px" id="launch-pulse">
          <div style="font-size:12px;font-weight:700;margin-bottom:8px">📊 Launch Pulse (Live)</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:800;color:#E8673C" id="pulse-invites">${d.size || '0'}</div>
              <div style="font-size:9px;color:var(--muted)">Invites Queued ✉️</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:800;color:var(--green)" id="pulse-opened">0</div>
              <div style="font-size:9px;color:var(--muted)">Opened 👀</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:800;color:#4299e1" id="pulse-joined">0</div>
              <div style="font-size:9px;color:var(--muted)">Joined 🎉</div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary" onclick="simulateLaunch()" style="width:100%;padding:14px;font-size:15px;font-weight:700" id="launch-cta">🚀 Launch Program Now</button>
      </div>
    `);
  }, 500);
}

function simulateLaunch() {
  const btn = document.getElementById('launch-cta');
  btn.textContent = 'Launching...'; btn.disabled = true;
  btn.style.background = 'var(--muted)';

  // Simulate the launch pulse updating
  let opened = 0, joined = 0;
  const openedEl = document.getElementById('pulse-opened');
  const joinedEl = document.getElementById('pulse-joined');

  const interval = setInterval(() => {
    opened += Math.floor(Math.random() * 8) + 3;
    joined += Math.floor(Math.random() * 4) + 1;
    if (openedEl) openedEl.textContent = opened;
    if (joinedEl) joinedEl.textContent = joined;
  }, 400);

  setTimeout(() => {
    clearInterval(interval);
    btn.textContent = '✅ Launched!';
    btn.style.background = 'var(--green)';
    launchConfetti();
    showCelebration('🎉', 'Program Launched!');
    addAgentMessage(`**You're live!** 🎉\n\nThe teaser email is going out right now. In 2 hours, the official invite with code **${chatState.data.companyCode}** will land in everyone's inbox.\n\nOff to a great start! Want a "Last Call" reminder on Friday? 😉`, true);
    showOptions(["Yes, send a Last Call Friday", "No, I'm good", "Go to Dashboard"]);
  }, 3000);
}

function showInviteTeamStep() {
  addAgentMessage("Love those programs? Let's get your team on board! 🚀\n\nTo launch, we need your team's details. **Download the template**, fill in names, roles, emails — then upload it back.", true);

  setTimeout(() => {
    addAgentHTML(`
      <div class="welcome-card" style="border-color:rgba(232,103,60,.2);background:linear-gradient(135deg,rgba(232,103,60,.04),rgba(66,153,225,.03))">
        <h3 style="margin-bottom:10px">📋 Invite Your Team</h3>
        <p style="font-size:13px;color:var(--text);margin-bottom:16px">Download the Excel template, fill in your team members, then upload it to get started.</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:28px;margin-bottom:8px">📥</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:4px">Step 1: Download Template</div>
            <p style="font-size:11px;color:var(--muted);margin-bottom:10px">Excel file with columns for Name, Role, Email, Phone, Department</p>
            <button class="btn btn-primary btn-sm" onclick="downloadTeamTemplate()" style="width:100%">Download .xlsx Template</button>
          </div>
          <div style="background:rgba(0,0,0,.02);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:28px;margin-bottom:8px">📤</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:4px">Step 2: Upload Filled File</div>
            <p style="font-size:11px;color:var(--muted);margin-bottom:10px">Upload the completed file to invite everyone</p>
            <label class="btn btn-secondary btn-sm" style="width:100%;cursor:pointer;display:flex;align-items:center;justify-content:center">
              Upload File
              <input type="file" accept=".xlsx,.xls,.csv" onchange="handleTeamUpload(this)" style="display:none">
            </label>
          </div>
        </div>

        <div id="upload-status"></div>

        <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px">Or share the download link directly:</div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--muted)">https://choysapp.com/download</div>
            <button class="btn btn-secondary btn-sm" onclick="copyAppLink()">Copy Link</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:10px">
            <span style="font-size:20px">📱</span>
            <div>
              <div style="font-size:12px;font-weight:600">Get the Choys App</div>
              <div style="font-size:11px;color:var(--muted)">Available on iOS & Android. Your team can start using wellness features right away!</div>
            </div>
          </div>
        </div>
      </div>
    `);

    showOptions(["I'll do this later", "Send invites via email instead"]);
  }, 600);
}

function downloadTeamTemplate() {
  // Generate a CSV file as a "template" (pretend XLSX)
  const csvContent = 'Full Name,Job Title / Role,Email Address,Phone Number,Department\nJohn Doe,Software Engineer,john@company.com,+65 9123 4567,Engineering\nJane Smith,HR Manager,jane@company.com,+65 9876 5432,Human Resources\n,,,,\n,,,,\n,,,,\n,,,,\n,,,,\n,,,,\n,,,,\n,,,,';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Choys_Team_Template_${chatState.data.name || 'Company'}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  addAgentMessage("Template downloaded! Fill in your team members and upload it back when ready. 📝", true);
}

function handleTeamUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('upload-status');
  status.innerHTML = `
    <div style="background:rgba(232,103,60,.06);border:1px solid rgba(232,103,60,.15);border-radius:8px;padding:12px;display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div class="spinner" style="width:20px;height:20px;border-width:2px;flex-shrink:0"></div>
      <div>
        <div style="font-size:13px;font-weight:600">Processing ${file.name}...</div>
        <div style="font-size:11px;color:var(--muted)">Validating team data</div>
      </div>
    </div>
  `;

  // Simulate processing
  setTimeout(() => {
    status.innerHTML = `
      <div style="background:rgba(232,103,60,.06);border:1px solid rgba(232,103,60,.25);border-radius:8px;padding:12px">
        <div style="font-size:13px;font-weight:600;color:var(--green);margin-bottom:4px">✅ File uploaded successfully!</div>
        <div style="font-size:11px;color:var(--muted)">Found team members in ${file.name}. Invitations will be sent to their emails.</div>
      </div>
    `;
    launchConfetti();
    addAgentMessage("Your team is being invited! They'll receive an email with a link to download the Choys app and join your wellness programs. 🎉\n\nYou can track onboarding progress in the **Global Analytics** dashboard.", true);
    showOptions(["Go to Dashboard", "Add PERMA Survey too"]);
  }, 2000);
}

function copyAppLink() {
  navigator.clipboard?.writeText('https://choysapp.com/download');
  const btn = event.target;
  btn.textContent = 'Copied!';
  setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
}

function showHandoff() {
  // Legacy - redirect to invite step
  showInviteTeamStep();
}

// ===========================================================
//  PERMA LANDING PAGE
// ===========================================================

let _permaInitialized = false;

function initPermaPage() {
  if (_permaInitialized) return;
  _permaInitialized = true;
  setTimeout(() => {
    drawPermaCompareRadar();
    drawPermaDashRadar();
    drawPillarRings();
  }, 100);
}

function permaScrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function drawPermaCompareRadar() {
  const canvas = document.getElementById('perma-compare-radar');
  if (!canvas) return;
  new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['Positive Emotions', 'Engagement', 'Relationships', 'Meaning', 'Accomplishment'],
      datasets: [{
        label: 'PERMA Score',
        data: [78, 85, 71, 82, 88],
        borderColor: '#1abc9c',
        backgroundColor: 'rgba(26,188,156,.15)',
        borderWidth: 2,
        pointBackgroundColor: '#1abc9c',
        pointRadius: 4
      }]
    },
    options: {
      responsive: false,
      scales: {
        r: {
          beginAtZero: true, max: 100,
          grid: { color: 'rgba(0,0,0,.06)' },
          angleLines: { color: 'rgba(0,0,0,.06)' },
          pointLabels: { color: '#6b7087', font: { size: 9 } },
          ticks: { display: false }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function drawPermaDashRadar() {
  const canvas = document.getElementById('perma-dash-radar');
  if (!canvas) return;
  new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['P', 'E', 'R', 'M', 'A'],
      datasets: [{
        label: 'Current',
        data: [78, 85, 71, 82, 88],
        borderColor: '#1abc9c',
        backgroundColor: 'rgba(26,188,156,.2)',
        borderWidth: 2,
        pointBackgroundColor: '#1abc9c',
        pointRadius: 5
      }, {
        label: 'Previous',
        data: [72, 80, 68, 78, 82],
        borderColor: 'rgba(108,92,231,.5)',
        backgroundColor: 'rgba(108,92,231,.08)',
        borderWidth: 1,
        borderDash: [4,4],
        pointRadius: 3
      }]
    },
    options: {
      responsive: false,
      scales: {
        r: {
          beginAtZero: true, max: 100,
          grid: { color: 'rgba(0,0,0,.06)' },
          angleLines: { color: 'rgba(0,0,0,.06)' },
          pointLabels: { color: '#1a1f36', font: { size: 14, weight: '700' } },
          ticks: { display: false }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function drawPillarRings() {
  document.querySelectorAll('.pillar-ring').forEach(canvas => {
    const score = parseInt(canvas.dataset.score) || 0;
    const color = canvas.dataset.color || '#1abc9c';
    const ctx = canvas.getContext('2d');
    const cx = 30, cy = 30, r = 24, lw = 5;
    // Background
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = lw; ctx.stroke();
    // Score arc
    const angle = (score / 100) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, angle);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  });
}

function activatePermaDash() {
  const status = document.querySelector('.pdh-status');
  if (status) { status.textContent = 'Activating...'; status.style.color = '#1abc9c'; status.style.borderColor = 'rgba(26,188,156,.3)'; status.style.background = 'rgba(26,188,156,.12)'; }

  // Update hero to show activating state
  const hero = document.querySelector('.perma-empty-hero');
  if (hero) {
    hero.innerHTML = `<div class="peh-content"><div class="peh-badge" style="background:rgba(26,188,156,.15);color:#1abc9c">Activating...</div><h1>Setting Up <span class="perma-gradient-text">PERMA Survey</span></h1><p>Loading your analytics dashboard with sample data...</p><div class="spinner" style="margin:16px auto"></div></div>`;
  }

  setTimeout(() => {
    if (status) { status.textContent = 'Active'; }
    // Hide empty state, show active state
    document.getElementById('perma-empty-state').style.display = 'none';
    hero.style.display = 'none';
    document.getElementById('perma-active-state').style.display = 'block';
    // Scroll to top
    document.getElementById('perma-screen').scrollTop = 0;
    // Draw all analytics charts
    drawPermaActiveDashboard();
  }, 1800);
}

function drawPermaActiveDashboard() {
  drawFlourishRing();
  drawActivePillarRings();
  drawPermaTrendChart();
  drawPermaActiveRadar();
  drawPermaDeptChart();
  animateFlourishScore();
}

function animateFlourishScore() {
  const el = document.getElementById('pf-score-val');
  if (!el) return;
  let current = 0;
  const target = 81;
  const step = () => {
    current += 2;
    if (current > target) current = target;
    el.textContent = current;
    if (current < target) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function drawFlourishRing() {
  const canvas = document.getElementById('perma-flourish-ring');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 90, cy = 90, r = 75, lw = 10;
  // Background ring
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = lw; ctx.stroke();
  // Score arc (81/100)
  const score = 81;
  const angle = (score / 100) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, angle);
  ctx.strokeStyle = '#1abc9c'; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
}

function drawActivePillarRings() {
  document.querySelectorAll('.pillar-ring-active').forEach(canvas => {
    const score = parseInt(canvas.dataset.score) || 0;
    const color = canvas.dataset.color || '#1abc9c';
    const ctx = canvas.getContext('2d');
    const cx = 30, cy = 30, r = 24, lw = 5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = lw; ctx.stroke();
    const angle = (score / 100) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, angle);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  });
}

function drawPermaTrendChart() {
  const canvas = document.getElementById('perma-trend-chart');
  if (!canvas) return;
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
      datasets: [
        { label: 'Overall', data: [68, 70, 72, 74, 77, 81], borderColor: '#1abc9c', backgroundColor: 'rgba(26,188,156,.1)', fill: true, tension: .4, borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#1abc9c' },
        { label: 'P', data: [65, 68, 70, 72, 75, 78], borderColor: '#f39c12', borderWidth: 1.5, tension: .4, pointRadius: 2, borderDash: [4,2] },
        { label: 'E', data: [70, 72, 75, 78, 80, 85], borderColor: '#3498db', borderWidth: 1.5, tension: .4, pointRadius: 2, borderDash: [4,2] },
        { label: 'R', data: [68, 70, 72, 74, 73, 71], borderColor: '#9b59b6', borderWidth: 1.5, tension: .4, pointRadius: 2, borderDash: [4,2] },
        { label: 'M', data: [62, 65, 68, 70, 76, 82], borderColor: '#1abc9c80', borderWidth: 1.5, tension: .4, pointRadius: 2, borderDash: [4,2] },
        { label: 'A', data: [72, 74, 78, 82, 86, 88], borderColor: '#2ecc71', borderWidth: 1.5, tension: .4, pointRadius: 2, borderDash: [4,2] }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#6b7087', font: { size: 10 }, boxWidth: 12, padding: 10 } }
      },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,.04)' }, ticks: { color: '#6b7087', font: { size: 10 } } },
        y: { min: 50, max: 100, grid: { color: 'rgba(0,0,0,.04)' }, ticks: { color: '#6b7087', font: { size: 10 } } }
      }
    }
  });
}

function drawPermaActiveRadar() {
  const canvas = document.getElementById('perma-active-radar');
  if (!canvas) return;
  new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['P', 'E', 'R', 'M', 'A'],
      datasets: [{
        label: 'Mar 2026',
        data: [78, 85, 71, 82, 88],
        borderColor: '#1abc9c',
        backgroundColor: 'rgba(26,188,156,.2)',
        borderWidth: 2,
        pointBackgroundColor: '#1abc9c',
        pointRadius: 5
      }, {
        label: 'Feb 2026',
        data: [75, 80, 73, 76, 86],
        borderColor: 'rgba(108,92,231,.5)',
        backgroundColor: 'rgba(108,92,231,.08)',
        borderWidth: 1.5,
        borderDash: [4,4],
        pointRadius: 3
      }]
    },
    options: {
      responsive: false,
      scales: {
        r: {
          beginAtZero: true, max: 100,
          grid: { color: 'rgba(0,0,0,.06)' },
          angleLines: { color: 'rgba(0,0,0,.06)' },
          pointLabels: { color: '#1a1f36', font: { size: 14, weight: '700' } },
          ticks: { display: false }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function drawPermaDeptChart() {
  const canvas = document.getElementById('perma-dept-chart');
  if (!canvas) return;
  const depts = ['Engineering', 'Sales', 'Marketing', 'Operations', 'HR'];
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: depts,
      datasets: [
        { label: 'P', data: [80, 82, 74, 70, 76], backgroundColor: '#f39c12', borderRadius: 3 },
        { label: 'E', data: [90, 84, 78, 80, 82], backgroundColor: '#3498db', borderRadius: 3 },
        { label: 'R', data: [65, 76, 74, 72, 68], backgroundColor: '#9b59b6', borderRadius: 3 },
        { label: 'M', data: [84, 80, 78, 82, 86], backgroundColor: '#1abc9c', borderRadius: 3 },
        { label: 'A', data: [92, 90, 82, 84, 86], backgroundColor: '#2ecc71', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#6b7087', font: { size: 10 }, boxWidth: 12, padding: 10 } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b7087', font: { size: 11 } } },
        y: { min: 50, max: 100, grid: { color: 'rgba(0,0,0,.04)' }, ticks: { color: '#6b7087', font: { size: 10 } } }
      }
    }
  });
}

// ---- Survey Hub Functions ----
function showPermaDetail() {
  document.getElementById('perma-detail-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePermaDetail() {
  document.getElementById('perma-detail-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function switchPermaTab(idx) {
  document.querySelectorAll('.pdp-step').forEach((s, i) => s.classList.toggle('active', i === idx));
  document.querySelectorAll('.pdp-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
}

function selectStars(el, rating) {
  const stars = el.parentElement.querySelectorAll('.pdp-star');
  stars.forEach((s, i) => s.classList.toggle('active', i < rating));
}

// ===========================================================
//  SURVEY BUILDER
// ===========================================================
let _builderQuestions = [];
let _savedSurveys = [];

function openSurveyBuilder() {
  _builderQuestions = [];
  document.getElementById('sb-name').value = '';
  document.getElementById('sb-desc').value = '';
  document.getElementById('sb-start').value = '';
  document.getElementById('sb-end').value = '';
  document.getElementById('sb-popup').checked = false;
  document.getElementById('sb-questions-list').innerHTML = '';
  switchBuilderTab(0);
  document.getElementById('survey-builder-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeSurveyBuilder() {
  document.getElementById('survey-builder-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function switchBuilderTab(idx) {
  document.querySelectorAll('[data-builder]').forEach((s, i) => s.classList.toggle('active', parseInt(s.dataset.builder) === idx));
  document.querySelectorAll('.builder-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
  if (idx === 2) renderBuilderPreview();
}

function addBuilderQuestion(type) {
  const id = Date.now();
  const typeLabels = { emoji: 'Emoji Scale', slider: 'Slider (0-10)', poll: 'Poll / MCQ', stars: 'Star Rating', thumbs: 'Thumbs Up/Down', text: 'Open Text' };
  const q = { id, type, text: '', options: type === 'poll' ? ['Option 1', 'Option 2'] : [] };
  _builderQuestions.push(q);
  renderBuilderQuestions();
}

function removeBuilderQuestion(id) {
  _builderQuestions = _builderQuestions.filter(q => q.id !== id);
  renderBuilderQuestions();
}

function renderBuilderQuestions() {
  const list = document.getElementById('sb-questions-list');
  if (_builderQuestions.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted)"><p style="font-size:14px;margin-bottom:4px">No questions yet</p><p style="font-size:12px">Click a question type below to add one</p></div>';
    return;
  }
  const typeLabels = { emoji: '😀 Emoji Scale', slider: '🎚️ Slider', poll: '📊 Poll / MCQ', stars: '⭐ Star Rating', thumbs: '👍 Thumbs', text: '✏️ Open Text' };
  const typePreview = {
    emoji: '<div style="display:flex;gap:6px;margin-top:6px"><span style="font-size:20px;opacity:.4">😔</span><span style="font-size:20px;opacity:.4">😕</span><span style="font-size:20px;opacity:.4">😐</span><span style="font-size:20px;opacity:.4">🙂</span><span style="font-size:20px;opacity:.4">🤩</span></div>',
    slider: '<div style="margin-top:6px"><input type="range" min="0" max="10" value="5" disabled style="width:100%;accent-color:#1abc9c"></div>',
    stars: '<div style="display:flex;gap:2px;margin-top:6px"><span style="font-size:18px;color:var(--border)">★★★★★</span></div>',
    thumbs: '<div style="display:flex;gap:6px;margin-top:6px;font-size:11px;color:var(--muted)"><span style="padding:4px 10px;border:1px solid var(--border);border-radius:12px">👎 No</span><span style="padding:4px 10px;border:1px solid var(--border);border-radius:12px">🤷 Maybe</span><span style="padding:4px 10px;border:1px solid var(--border);border-radius:12px">👍 Yes</span></div>',
    text: '<div style="margin-top:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;font-size:11px;color:var(--muted)">Employee will type their response here...</div>'
  };

  list.innerHTML = _builderQuestions.map((q, i) => {
    let optionsHTML = '';
    if (q.type === 'poll') {
      optionsHTML = `<div class="sb-q-options" id="opts-${q.id}">${q.options.map((o, oi) => `<div class="sb-q-option-row"><input class="input" value="${o}" placeholder="Option ${oi+1}" onchange="_builderQuestions[${i}].options[${oi}]=this.value"><button onclick="removePollOption(${q.id},${oi})">×</button></div>`).join('')}</div><button class="sb-q-add-option" onclick="addPollOption(${q.id})">+ Add option</button>`;
    } else {
      optionsHTML = typePreview[q.type] || '';
    }
    return `<div class="sb-q-card">
      <div class="sb-q-card-header">
        <span class="sb-q-num">Q${i+1}</span>
        <span class="sb-q-type">${typeLabels[q.type]}</span>
        <button class="sb-q-delete" onclick="removeBuilderQuestion(${q.id})">×</button>
      </div>
      <input class="input" value="${q.text}" placeholder="Enter your question..." onchange="_builderQuestions[${i}].text=this.value">
      ${optionsHTML}
    </div>`;
  }).join('');
}

function addPollOption(qId) {
  const q = _builderQuestions.find(q => q.id === qId);
  if (q) { q.options.push(`Option ${q.options.length + 1}`); renderBuilderQuestions(); }
}

function removePollOption(qId, idx) {
  const q = _builderQuestions.find(q => q.id === qId);
  if (q && q.options.length > 1) { q.options.splice(idx, 1); renderBuilderQuestions(); }
}

function renderBuilderPreview() {
  const name = document.getElementById('sb-name')?.value || 'Untitled Survey';
  const desc = document.getElementById('sb-desc')?.value || '';
  const endDate = document.getElementById('sb-end')?.value || '';
  const vis = document.getElementById('sb-visibility')?.value || 'anonymous';
  const freq = document.getElementById('sb-frequency')?.value || 'once';
  const isPopup = document.getElementById('sb-popup')?.checked;

  document.getElementById('sb-preview-title').textContent = name;
  document.getElementById('sb-preview-desc').textContent = desc;

  const meta = document.getElementById('sb-preview-meta');
  meta.innerHTML = `
    <span class="shc-tag">${_builderQuestions.length} Questions</span>
    <span class="shc-tag">${vis === 'anonymous' ? '🔒 Anonymous' : '👤 Named'}</span>
    <span class="shc-tag">${freq.charAt(0).toUpperCase() + freq.slice(1)}</span>
    ${endDate ? `<span class="shc-tag">Ends: ${endDate}</span>` : ''}
    ${isPopup ? '<span class="shc-tag" style="background:rgba(108,92,231,.15);color:var(--accent)">📌 Pop-up Survey</span>' : ''}
  `;

  const typeEmoji = { emoji: '😀😕😐🙂🤩', slider: '🎚️ 0-10 scale', poll: '📊', stars: '⭐⭐⭐⭐⭐', thumbs: '👎🤷👍', text: '✏️ Free text' };
  const qList = document.getElementById('sb-preview-questions');
  if (_builderQuestions.length === 0) {
    qList.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted)">No questions added yet</div>';
  } else {
    qList.innerHTML = _builderQuestions.map((q, i) => `
      <div class="sb-pq">
        <span class="sb-pq-num">Question ${i+1}</span>
        <div class="sb-pq-text">${q.text || 'Untitled question'}</div>
        <div class="sb-pq-type-preview">${typeEmoji[q.type] || q.type}${q.type === 'poll' ? ' — ' + q.options.join(' / ') : ''}</div>
      </div>
    `).join('');
  }
}

function saveSurvey() {
  const name = document.getElementById('sb-name')?.value?.trim();
  if (!name) { alert('Please enter a survey name'); switchBuilderTab(0); return; }
  if (_builderQuestions.length === 0) { alert('Please add at least one question'); switchBuilderTab(1); return; }

  const isPopup = document.getElementById('sb-popup')?.checked;
  // If popup, unset all other popups
  if (isPopup) _savedSurveys.forEach(s => s.isPopup = false);

  const survey = {
    id: Date.now(),
    name,
    description: document.getElementById('sb-desc')?.value || '',
    startDate: document.getElementById('sb-start')?.value || '',
    endDate: document.getElementById('sb-end')?.value || '',
    visibility: document.getElementById('sb-visibility')?.value || 'anonymous',
    frequency: document.getElementById('sb-frequency')?.value || 'once',
    isPopup,
    questions: [..._builderQuestions],
    createdAt: new Date().toISOString()
  };

  _savedSurveys.push(survey);
  closeSurveyBuilder();
  renderSurveyLists();
  alert(`Survey "${name}" saved successfully!`);
}

function renderSurveyLists() {
  const sections = ['survey-list-section', 'survey-list-section-active'];
  const lists = ['survey-list', 'survey-list-active'];

  sections.forEach((secId, idx) => {
    const sec = document.getElementById(secId);
    const list = document.getElementById(lists[idx]);
    if (!sec || !list) return;

    if (_savedSurveys.length === 0) {
      sec.style.display = 'none';
      return;
    }

    sec.style.display = 'block';
    list.innerHTML = _savedSurveys.map(s => `
      <div class="survey-list-card">
        <div class="slc-info">
          <h5>${s.name}</h5>
          <p>${s.questions.length} questions · ${s.frequency} · ${s.visibility === 'anonymous' ? '🔒 Anonymous' : '👤 Named'}${s.endDate ? ' · Ends ' + s.endDate : ''}</p>
        </div>
        <div class="slc-actions">
          ${s.isPopup ? '<span class="slc-popup-badge">📌 Pop-up</span>' : ''}
          <button class="btn btn-secondary btn-sm" onclick="toggleSurveyPopup(${s.id})">${s.isPopup ? 'Remove Pop-up' : 'Set as Pop-up'}</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteSurvey(${s.id})">×</button>
        </div>
      </div>
    `).join('');
  });
}

function toggleSurveyPopup(id) {
  const survey = _savedSurveys.find(s => s.id === id);
  if (!survey) return;
  if (!survey.isPopup) _savedSurveys.forEach(s => s.isPopup = false);
  survey.isPopup = !survey.isPopup;
  renderSurveyLists();
}

function deleteSurvey(id) {
  _savedSurveys = _savedSurveys.filter(s => s.id !== id);
  renderSurveyLists();
}

function submitPermaDemo() {
  const name = document.getElementById('perma-name')?.value?.trim();
  const email = document.getElementById('perma-email')?.value?.trim();
  const company = document.getElementById('perma-company')?.value?.trim();
  const size = document.getElementById('perma-size')?.value;
  const status = document.getElementById('perma-form-status');

  if (!name || !email || !company) {
    status.innerHTML = '<span style="color:var(--red)">Please fill in all fields</span>';
    return;
  }

  // Store demo request (could POST to Google Sheets or webhook)
  status.innerHTML = '<span style="color:#1abc9c">Thanks! We\'ll be in touch within 24 hours.</span>';
  // Clear form
  document.getElementById('perma-name').value = '';
  document.getElementById('perma-email').value = '';
  document.getElementById('perma-company').value = '';
  document.getElementById('perma-size').value = '';
}

// ===========================================================
//  PERMA SURVEY STEP IN ONBOARDING
// ===========================================================

// Legacy PERMA functions — redirected to new flow
function showPermaOffer() { pitchPermaSurvey(); }
function activatePerma() { acceptPerma(); }
function skipPerma() { declinePerma(); }

// ---- Init ----
(function() {
  // Load OpenAI key from Vercel env (injected via env.js)
  if (window.__ENV__?.OPENAI_API_KEY) {
    ChoysAPI.openaiKey = window.__ENV__.OPENAI_API_KEY;
  }
  initEnvSelector();
  updateDashAuth();
})();
