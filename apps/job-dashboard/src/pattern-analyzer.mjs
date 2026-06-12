export function analyzePatterns(jobs = []) {
  if (jobs.length === 0) {
    return { error: 'No jobs found to analyze.' };
  }

  const actionable = jobs.filter(j => j.status !== 'discovered');
  if (actionable.length < 5) {
    return { error: 'Not enough data: Need at least 5 jobs beyond "discovered" status.' };
  }

  // --- Funnel ---
  const funnel = {};
  for (const j of jobs) {
    const s = j.status;
    funnel[s] = (funnel[s] || 0) + 1;
  }

  // --- Outcomes ---
  const positive = ['applied', 'responded', 'interview', 'offer'];
  const negative = ['rejected', 'discarded'];
  
  const scoresByOutcome = { positive: [], negative: [], pending: [] };
  for (const j of actionable) {
    const outcome = positive.includes(j.status) ? 'positive' : (negative.includes(j.status) ? 'negative' : 'pending');
    if (j.cvMatchScore > 0) scoresByOutcome[outcome].push(j.cvMatchScore);
  }

  const scoreStats = (arr) => {
    if (arr.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    return {
      avg: Math.round(avg * 100) / 100,
      min: Math.min(...arr),
      max: Math.max(...arr),
      count: arr.length,
    };
  };

  const scoreComparison = {
    positive: scoreStats(scoresByOutcome.positive),
    negative: scoreStats(scoresByOutcome.negative),
    pending: scoreStats(scoresByOutcome.pending),
  };

  // --- Portal breakdown ---
  const portalMap = new Map();
  for (const j of actionable) {
    const portal = j.portal || 'unknown';
    if (!portalMap.has(portal)) portalMap.set(portal, { total: 0, positive: 0, negative: 0 });
    const entry = portalMap.get(portal);
    entry.total++;
    if (positive.includes(j.status)) entry.positive++;
    if (negative.includes(j.status)) entry.negative++;
  }
  const portalBreakdown = [...portalMap.entries()].map(([portal, data]) => ({
    portal,
    ...data,
    conversionRate: data.total > 0 ? Math.round((data.positive / data.total) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  // --- Skill gaps ---
  const skillGapCounts = new Map();
  for (const j of actionable) {
    if (!negative.includes(j.status)) continue;
    const missing = Array.isArray(j.cvMissingSkills) ? j.cvMissingSkills : [];
    for (const skill of missing) {
      skillGapCounts.set(skill, (skillGapCounts.get(skill) || 0) + 1);
    }
  }
  const topSkillGaps = [...skillGapCounts.entries()]
    .map(([skill, frequency]) => ({ skill, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);

  return {
    metadata: {
      total: jobs.length,
      actionable: actionable.length,
      analysisDate: new Date().toISOString().split('T')[0],
    },
    funnel,
    scoreComparison,
    portalBreakdown,
    topSkillGaps,
  };
}
