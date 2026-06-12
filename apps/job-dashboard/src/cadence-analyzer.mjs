import { DEFAULT_CADENCE, computeUrgency, computeNextFollowupDate, normalizeStatus } from '../../../followup-cadence.mjs';

export function analyzeCadence(jobs = [], followUps = [], config = {}) {
  const cadence = { ...DEFAULT_CADENCE, ...config };
  const now = new Date(new Date().toISOString().split('T')[0]);
  
  // Group follow-ups by job ID
  const followUpsByJob = new Map();
  for (const fu of followUps) {
    if (!followUpsByJob.has(fu.jobId)) followUpsByJob.set(fu.jobId, []);
    followUpsByJob.get(fu.jobId).push(fu);
  }

  const entries = [];
  const actionableStatuses = ['applied', 'responded', 'interview'];

  for (const job of jobs) {
    const status = normalizeStatus(job.status);
    if (!actionableStatuses.includes(status)) continue;

    const appDate = job.appliedDate || job.createdAt; // Fallback to createdAt if appliedDate missing
    if (!appDate) continue;

    const parsedAppDate = new Date(appDate);
    const daysSinceApp = daysBetween(parsedAppDate, now);
    const jobFollowUps = followUpsByJob.get(job.id) || [];
    const followupCount = jobFollowUps.length;

    let lastFollowupDate = null;
    let daysSinceLastFollowup = null;
    if (followupCount > 0) {
      const sorted = jobFollowUps.sort((a, b) => (new Date(a.date) > new Date(b.date) ? -1 : 1));
      lastFollowupDate = sorted[0].date;
      const lastDate = new Date(lastFollowupDate);
      daysSinceLastFollowup = daysBetween(lastDate, now);
    }

    // Adapt computeUrgency and computeNextFollowupDate to use our cadence object
    const urgency = computeUrgencyWithCadence(status, daysSinceApp, daysSinceLastFollowup, followupCount, cadence);
    const nextFollowupDate = computeNextFollowupDateWithCadence(status, appDate, lastFollowupDate, followupCount, cadence);
    
    const nextDate = nextFollowupDate ? new Date(nextFollowupDate) : null;
    const daysUntilNext = nextDate ? daysBetween(now, nextDate) : null;

    entries.push({
      id: job.id,
      company: job.company,
      role: job.title,
      status: status,
      appliedDate: appDate,
      daysSinceApplication: daysSinceApp,
      daysSinceLastFollowup,
      followupCount,
      urgency,
      nextFollowupDate,
      daysUntilNext,
    });
  }

  const urgencyOrder = { urgent: 0, overdue: 1, waiting: 2, cold: 3 };
  entries.sort((a, b) => (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9));

  return {
    metadata: {
      analysisDate: now.toISOString().split('T')[0],
      totalActionable: entries.length,
      overdue: entries.filter(e => e.urgency === 'overdue').length,
      urgent: entries.filter(e => e.urgency === 'urgent').length,
    },
    entries,
  };
}

function daysBetween(d1, d2) {
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

// These helpers are needed because the root system uses a global CADENCE constant
function computeUrgencyWithCadence(status, daysSinceApp, daysSinceLastFollowup, followupCount, cadence) {
  if (status === 'applied') {
    if (followupCount >= cadence.applied_max_followups) return 'cold';
    if (followupCount === 0 && daysSinceApp >= cadence.applied_first) return 'overdue';
    if (followupCount > 0 && daysSinceLastFollowup !== null && daysSinceLastFollowup >= cadence.applied_subsequent) return 'overdue';
    return 'waiting';
  }
  if (status === 'responded') {
    if (daysSinceApp < cadence.responded_initial) return 'urgent';
    if (daysSinceApp >= cadence.responded_subsequent) return 'overdue';
    return 'waiting';
  }
  if (status === 'interview') {
    if (daysSinceApp >= cadence.interview_thankyou) return 'overdue';
    return 'waiting';
  }
  return 'waiting';
}

function computeNextFollowupDateWithCadence(status, appDate, lastFollowupDate, followupCount, cadence) {
  const parseDate = (d) => new Date(d);
  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString().split('T')[0];
  };

  if (status === 'applied') {
    if (followupCount >= cadence.applied_max_followups) return null;
    if (followupCount === 0) return addDays(parseDate(appDate), cadence.applied_first);
    if (lastFollowupDate) return addDays(parseDate(lastFollowupDate), cadence.applied_subsequent);
    return addDays(parseDate(appDate), cadence.applied_first);
  }
  if (status === 'responded') {
    if (lastFollowupDate) return addDays(parseDate(lastFollowupDate), cadence.responded_subsequent);
    return addDays(parseDate(appDate), cadence.responded_subsequent);
  }
  if (status === 'interview') {
    return addDays(parseDate(appDate), cadence.interview_thankyou);
  }
  return null;
}
