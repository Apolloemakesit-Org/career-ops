export const fieldAliases = {
  full_name: ['full_name', 'Full name', 'Name', 'Nume', 'Nume complet', 'Legal name'],
  first_name: ['first_name', 'First name', 'Prenume'],
  last_name: ['last_name', 'Last name', 'Nume de familie'],
  email: ['email', 'E-mail', 'Email address', 'Adresa email'],
  phone: ['phone', 'Phone', 'Phone number', 'Telefon', 'Numar de telefon'],
  location: ['location', 'Location', 'City', 'Oras', 'Locatie'],
  linkedin: ['linkedin', 'LinkedIn', 'LinkedIn profile', 'Profil LinkedIn'],
  github: ['github', 'GitHub', 'GitHub profile', 'Portfolio'],
  cv: ['cv', 'CV', 'Resume', 'Curriculum Vitae', 'Upload CV', 'Upload resume', 'upload_resume', 'attach_resume'],
  cover_letter: ['cover_letter', 'Cover letter', 'Scrisoare de intentie', 'Message to recruiter', 'Additional information'],
  work_authorization: ['work_authorization', 'Work authorization', 'Drept de munca', 'Authorized to work'],
  salary_expectation: ['salary_expectation', 'Salary expectation', 'Expected salary', 'Salariu dorit', 'Pretentii salariale'],
  notice_period: ['notice_period', 'Notice period', 'Preaviz'],
};

export function buildRequiredFields({ packageFields = {}, profile = {}, coverLetter = '' } = {}) {
  return {
    full_name: profile.fullName || '',
    email: profile.email || '',
    phone: profile.phone || '',
    location: profile.location || '',
    linkedin: profile.linkedin || '',
    github: profile.github || '',
    cover_letter: coverLetter || '',
    work_authorization: profile.applicationDefaults?.work_authorization || '',
    notice_period: profile.applicationDefaults?.notice_period || '',
    ...packageFields,
  };
}

export function buildFieldCandidates(label, fieldHints = {}) {
  return unique([
    ...(fieldHints.fieldAliases?.[label] || []),
    ...(fieldHints.fields?.[label] || []),
    ...(fieldAliases[label] || [label, humanize(label)]),
  ]);
}

export async function fillKnownFields(page, fields, missingFields = {}, options = {}) {
  for (const [label, value] of Object.entries(fields)) {
    if (!value) {
      missingFields[label] = 'Required value is empty.';
      continue;
    }

    const filled = await tryFillField(page, label, value, options.fieldHints || {});
    if (!filled) missingFields[label] = 'Could not locate a matching field on the page.';
  }
  return missingFields;
}

export async function detectScreeningQuestions(page) {
  const items = await page.locator('textarea, [contenteditable="true"], [contenteditable=""]').evaluateAll(elements => {
    function visible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    }
    function labelFor(element) {
      const id = element.getAttribute('id') || '';
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '';
      const closestLabel = element.closest('label')?.textContent || '';
      const heading = element.closest('section, article, div, fieldset, form')?.querySelector('h1,h2,h3,h4,legend,label,p')?.textContent || '';
      return [
        explicit,
        element.getAttribute('aria-label') || '',
        element.getAttribute('placeholder') || '',
        closestLabel,
        heading,
      ].map(text => String(text || '').replace(/\s+/g, ' ').trim()).find(Boolean) || '';
    }

    return elements.map((element, index) => {
      const text = element.tagName === 'TEXTAREA' ? element.value : element.textContent;
      if (!visible(element) || String(text || '').trim()) return null;
      const question = labelFor(element);
      element.setAttribute('data-career-ops-screening-index', String(index));
      return {
        question,
        selector: `[data-career-ops-screening-index="${index}"]`,
      };
    }).filter(Boolean);
  });
  return items.filter(item => looksLikeScreeningQuestion(item.question));
}

export async function tryFillField(page, label, value, fieldHints = {}) {
  const isFileField = label === 'cv' || label === 'resume' || label === 'cover_letter_pdf';

  for (const candidate of buildFieldCandidates(label, fieldHints)) {
    const locators = [
      page.getByLabel(candidate),
      page.getByPlaceholder(candidate),
      page.locator(`[name="${cssEscape(candidate)}"]`),
      page.locator(`[aria-label="${cssEscape(candidate)}"]`),
      // Common for file inputs
      page.locator(`input[type="file"]`),
    ];

    for (const locator of locators) {
      try {
        if (await locator.count() > 0) {
          const target = isFileField && (await locator.count() > 1) 
            ? locator.filter({ hasText: new RegExp(candidate, 'i') }).first() 
            : locator.first();

          if (isFileField) {
            // For file inputs, we might need a more direct selector if getByLabel fails
            const type = await target.getAttribute('type').catch(() => '');
            if (type === 'file') {
              await target.setInputFiles(String(value), { timeout: 2000 });
              return true;
            }
          }

          if (await target.isEditable({ timeout: 1000 }).catch(() => false)) {
            await target.fill(String(value), { timeout: 2000 });
            return true;
          }
        }
      } catch {
        // Continue with the next locator strategy.
      }
    }
  }

  return false;
}

export function isSubmitControl(label) {
  return /\b(submit|send|apply|trimite|aplica|aplică|finalizeaza|finalizează)\b/i.test(String(label));
}

function humanize(value) {
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}

function unique(values) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

export function looksLikeScreeningQuestion(label) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 15 || isSubmitControl(text)) return false;
  const normalized = normalizeLabel(text);
  const knownField = Object.values(fieldAliases)
    .flat()
    .some(alias => normalizeLabel(alias) === normalized || normalized.includes(normalizeLabel(alias)));
  if (knownField) return false;
  return /\?$/.test(text) || /\b(why|how|describe|tell us|what|explain|motivat|de ce|cum|descrie|povest)\b/i.test(text);
}

export function normalizeQuestion(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
}

function normalizeLabel(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
