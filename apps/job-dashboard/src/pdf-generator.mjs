import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderHtmlToPdf } from '../../../generate-pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const templatePath = path.join(repoRoot, 'templates', 'cv-template.html');

export async function generatePackagePdf(pkg, profile) {
  const template = await readFile(templatePath, 'utf8');
  const html = renderCvHtml(template, pkg, profile);
  
  const fileName = `cv-${pkg.id}-${Date.now()}.pdf`;
  const outputPath = path.join(repoRoot, 'output', fileName);
  
  const result = await renderHtmlToPdf(html, outputPath, {
    format: 'a4',
    baseDir: path.join(repoRoot, 'templates')
  });
  
  return {
    ...result,
    fileName,
    relativePath: `output/${fileName}`
  };
}

function renderCvHtml(template, pkg, profile) {
  const cvMd = pkg.tailoredCvMd || '';
  
  // Basic markdown to HTML conversion similar to app.js
  const cvHtml = simpleMarkdown(cvMd);
  
  // We need to map the markdown sections to the template placeholders.
  // The template has: {{NAME}}, {{PHONE}}, {{EMAIL}}, {{LINKEDIN_URL}}, {{LINKEDIN_DISPLAY}}, 
  // {{PORTFOLIO_URL}}, {{PORTFOLIO_DISPLAY}}, {{LOCATION}}, {{SECTION_SUMMARY}}, {{SUMMARY_TEXT}},
  // {{SECTION_COMPETENCIES}}, {{COMPETENCIES}}, {{SECTION_EXPERIENCE}}, {{EXPERIENCE}}, 
  // {{SECTION_PROJECTS}}, {{PROJECTS}}, {{SECTION_EDUCATION}}, {{EDUCATION}}, 
  // {{SECTION_CERTIFICATIONS}}, {{CERTIFICATIONS}}, {{SECTION_SKILLS}}, {{SKILLS}}

  // For a truly tailored CV, we might want to extract these from cvMd.
  // But if cvMd is the WHOLE CV, we might just want to inject it into one of the sections or split it.
  
  // If tailoredCvMd follows the standard structure, we can try to split by H2.
  const sections = splitSections(cvMd);

  let html = template;
  html = html.replace(/{{NAME}}/g, profile.fullName || 'Candidate');
  html = html.replace(/{{PHONE}}/g, profile.phone || '');
  html = html.replace(/{{EMAIL}}/g, profile.email || '');
  html = html.replace(/{{LINKEDIN_URL}}/g, profile.linkedin || '');
  html = html.replace(/{{LINKEDIN_DISPLAY}}/g, profile.linkedin ? 'LinkedIn' : '');
  html = html.replace(/{{PORTFOLIO_URL}}/g, profile.github || '');
  html = html.replace(/{{PORTFOLIO_DISPLAY}}/g, profile.github ? 'GitHub' : '');
  html = html.replace(/{{LOCATION}}/g, profile.location || '');
  html = html.replace(/{{LANG}}/g, 'en');
  html = html.replace(/{{PAGE_WIDTH}}/g, '800px');

  html = html.replace(/{{SECTION_SUMMARY}}/g, 'Professional Summary');
  html = html.replace(/{{SUMMARY_TEXT}}/g, simpleMarkdown(sections.summary || ''));
  
  html = html.replace(/{{SECTION_COMPETENCIES}}/g, 'Core Competencies');
  html = html.replace(/{{COMPETENCIES}}/g, renderCompetencies(sections.competencies || ''));
  
  html = html.replace(/{{SECTION_EXPERIENCE}}/g, 'Work Experience');
  html = html.replace(/{{EXPERIENCE}}/g, renderExperience(sections.experience || ''));
  
  html = html.replace(/{{SECTION_PROJECTS}}/g, 'Selected Projects');
  html = html.replace(/{{PROJECTS}}/g, renderProjects(sections.projects || ''));
  
  html = html.replace(/{{SECTION_EDUCATION}}/g, 'Education');
  html = html.replace(/{{EDUCATION}}/g, renderEducation(sections.education || ''));
  
  html = html.replace(/{{SECTION_CERTIFICATIONS}}/g, 'Certifications');
  html = html.replace(/{{CERTIFICATIONS}}/g, renderCertifications(sections.certifications || ''));
  
  html = html.replace(/{{SECTION_SKILLS}}/g, 'Technical Skills');
  html = html.replace(/{{SKILLS}}/g, renderSkills(sections.skills || ''));

  return html;
}

function splitSections(markdown) {
  const sections = {};
  const lines = markdown.split(/\r?\n/);
  let currentSection = '';
  let currentBody = [];

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (currentSection) sections[currentSection] = currentBody.join('\n');
      const title = h2[1].toLowerCase();
      if (title.includes('summary')) currentSection = 'summary';
      else if (title.includes('competencies')) currentSection = 'competencies';
      else if (title.includes('experience') || title.includes('work')) currentSection = 'experience';
      else if (title.includes('projects')) currentSection = 'projects';
      else if (title.includes('education')) currentSection = 'education';
      else if (title.includes('certifications')) currentSection = 'certifications';
      else if (title.includes('skills')) currentSection = 'skills';
      else currentSection = title.replace(/\s+/g, '_');
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentSection) sections[currentSection] = currentBody.join('\n');
  return sections;
}

function simpleMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function renderCompetencies(text) {
  return text.split(/\r?\n/)
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .map(item => `<div class="competency-tag">${item}</div>`)
    .join('\n');
}

function renderExperience(text) {
  // Very simplified: expects ### Company - Role [Period]
  const jobs = text.split(/^###\s+/m).filter(Boolean);
  return jobs.map(job => {
    const lines = job.split(/\r?\n/);
    const header = lines[0];
    const body = lines.slice(1).join('\n');
    
    const [companyRole, period] = header.split(/\s+\[(.*?)\]/);
    const [company, role] = companyRole.split(/\s+-\s+/);
    
    return `
      <div class="job">
        <div class="job-header">
          <div class="job-company">${company || ''}</div>
          <div class="job-period">${period || ''}</div>
        </div>
        <div class="job-role">${role || ''}</div>
        <ul>
          ${body.split(/\r?\n/).filter(l => l.trim().startsWith('-')).map(l => `<li>${simpleMarkdown(l.replace(/^-\s*/, ''))}</li>`).join('')}
        </ul>
      </div>
    `;
  }).join('\n');
}

function renderProjects(text) {
  const projects = text.split(/^###\s+/m).filter(Boolean);
  return projects.map(project => {
    const lines = project.split(/\r?\n/);
    const title = lines[0];
    const body = lines.slice(1).join('\n');
    return `
      <div class="project">
        <div class="project-title">${title}</div>
        <div class="project-desc">${simpleMarkdown(body)}</div>
      </div>
    `;
  }).join('\n');
}

function renderEducation(text) {
  const items = text.split(/\r?\n/).filter(l => l.trim().startsWith('-'));
  return items.map(item => {
    const clean = item.replace(/^-\s*/, '');
    return `<div class="edu-item"><div class="edu-title">${simpleMarkdown(clean)}</div></div>`;
  }).join('\n');
}

function renderCertifications(text) {
  const items = text.split(/\r?\n/).filter(l => l.trim().startsWith('-'));
  return items.map(item => {
    const clean = item.replace(/^-\s*/, '');
    return `<div class="cert-item"><div class="cert-title">${simpleMarkdown(clean)}</div></div>`;
  }).join('\n');
}

function renderSkills(text) {
  return `<div class="skills-grid"><div class="skill-item">${simpleMarkdown(text)}</div></div>`;
}
