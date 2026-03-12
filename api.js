// === Choys API Client ===
const ChoysAPI = {
  baseUrl: localStorage.getItem('choys_base_url') || 'https://api.dev.choysapp.com',
  accessToken: localStorage.getItem('choys_access_token') || '',
  refreshToken: localStorage.getItem('choys_refresh_token') || '',
  openaiKey: localStorage.getItem('choys_openai_key') || '',
  selectedTenantId: null, // null = use token's default tenant

  headers() {
    const h = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      'app-platform': 'choys-web-app'
    };
    if (this.selectedTenantId) {
      h['x-tenant-id'] = this.selectedTenantId;
      h['tenant-id'] = this.selectedTenantId;
    }
    return h;
  },

  async request(method, path, body = null) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, opts);
      const data = await res.json();
      // Auto-refresh token if present in response
      if (data?.data?.accessToken) {
        this.accessToken = data.data.accessToken;
        localStorage.setItem('choys_access_token', data.data.accessToken);
      }
      if (data?.data?.refreshToken) {
        this.refreshToken = data.data.refreshToken;
        localStorage.setItem('choys_refresh_token', data.data.refreshToken);
      }
      return data;
    } catch (e) {
      console.error(`API Error [${method} ${path}]:`, e);
      return { error: true, message: e.message };
    }
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },

  // === Auth ===
  sendOTP(email) {
    return this.post('/auth/login/send-otp', { emailAddress: email });
  },
  verifyOTP(email, otp) {
    return this.post('/auth/login/verify-otp', { emailAddress: email, otp });
  },

  // === Tenant ===
  getTenantDetail() { return this.get('/v2/web/tenants'); },
  getTenantConfig() { return this.get('/v2/web/tenants/config'); },
  getOverviewStats() { return this.get('/v2/web/tenants/overview-stats'); },
  getEmployeeActivity() { return this.get('/v2/web/tenants/activity'); },
  getFeatureTrend() { return this.get('/v2/web/tenants/feature-trend'); },
  getUserStats() { return this.get('/v2/web/tenants/user-stats'); },

  // === Tenant List (Portal) ===
  getTenantList() { return this.get('/v2/portal/tenants'); },

  // === Mood ===
  getMoodMeterStats(period = 12) { return this.get(`/web/mood/stats/mood-meter?period=${period}`); },
  getMoodParticipation(period = 12) { return this.get(`/web/mood/stats/mood-participation?period=${period}`); },
  getMoodTracker(period = 12) { return this.get(`/web/mood/stats/mood-tracker?period=${period}`); },
  getMoodRecord(period = 12) { return this.get(`/web/mood/stats/mood-record?period=${period}`); },

  // === Recognition ===
  getRecognitionInsights(period = 12) { return this.get(`/web/recognition/insights?period=${period}`); },
  getTopContributors() { return this.get('/web/recognition/top'); },
  getRecentRecognitions() { return this.get('/web/recognition/recent'); },

  // === Coins ===
  getCoinInsights(period = 12) { return this.get(`/web/coins/insights?period=${period}`); },

  // === AI Insights ===
  getAIInsights() { return this.get('/web/ai-insights'); },
  getAIROE() { return this.get('/web/ai-insights/roe'); },
  getAICulturalImpact() { return this.get('/web/ai-insights/cultural-impact'); },
  getAIProductivity() { return this.get('/web/ai-insights/productivity'); },
  getAISummary() { return this.get('/web/ai-insights/summary'); },
  getFeatureDeepDive() { return this.get('/web/ai-insights/feature-deep-dive'); },

  // === Surveys ===
  getSurveys() { return this.get('/web/surveys'); },
  getSurveyInsights(surveyId) { return this.get(`/web/surveys/${surveyId}/insights`); },
  getSurveyQuestionInsights(surveyId) { return this.get(`/web/surveys/${surveyId}/question-insights`); },

  // === Dashboard Stats ===
  getTenantDonatedCoinStats() { return this.get('/donate/stats/tenant'); },
  getTenantUserStats() { return this.get('/tenant/stats/user'); },
  getTenantEarnedCoinStats() { return this.get('/coins/stats/tenant'); },
  getTenantInviteStats() { return this.get('/invite/stats/tenant'); },

  // === Users ===
  listTenantUsers(limit = 100) { return this.get(`/web/users?limit=${limit}`); },
  searchTenantUsers(query) { return this.get(`/web/users/search?query=${query}`); },

  // === Gift Card Insights ===
  getGiftCardInsights() { return this.get('/web/gift-cards/insights'); },

  // === Challenges ===
  getChallenges() { return this.get('/web/challenges'); },

  // === Leaderboard ===
  getLeaderboard() { return this.post('/leaderboard/users', {}); },

  // === OpenAI Integration ===
  async chatWithAI(messages, { json = false, maxTokens = 2000 } = {}) {
    if (!this.openaiKey) {
      return { error: true, message: 'OpenAI API key not set. Go to Settings.' };
    }
    try {
      const body = {
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: maxTokens
      };
      if (json) body.response_format = { type: 'json_object' };
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.openaiKey}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.error) return { error: true, message: data.error.message };
      return { content: data.choices?.[0]?.message?.content || 'No response' };
    } catch (e) {
      return { error: true, message: e.message };
    }
  },

  async analyzeWithAI(prompt, context = '') {
    return this.chatWithAI([
      { role: 'system', content: 'You are a senior PM and wellness program strategist for Choys, an employee wellness platform. Be specific, actionable, data-driven.' },
      { role: 'user', content: context ? `Context:\n${context}\n\n${prompt}` : prompt }
    ]);
  },

  // Save settings
  saveSettings(baseUrl, token, openaiKey) {
    this.baseUrl = baseUrl;
    this.accessToken = token;
    this.openaiKey = openaiKey;
    localStorage.setItem('choys_base_url', baseUrl);
    localStorage.setItem('choys_access_token', token);
    localStorage.setItem('choys_openai_key', openaiKey);
  },

  isConnected() {
    return !!this.accessToken;
  }
};
