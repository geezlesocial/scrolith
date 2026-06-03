import PDFDocument = require('pdfkit');
import type { ResumeGenerationOutput, ResumeProfileSource, ResumeTemplate } from './resume.types';

type RenderInput = {
  profile: ResumeProfileSource;
  resume: ResumeGenerationOutput;
  template: ResumeTemplate;
  includePhoto: boolean;
  photoUrl?: string | null;
  targetRole?: string | null;
};

type PdfPalette = {
  accent: string;
  muted: string;
  ink: string;
};

const templatePalettes: Record<ResumeTemplate, PdfPalette> = {
  professional: { accent: '#1f3a5f', muted: '#64748b', ink: '#111827' },
  modern: { accent: '#2563eb', muted: '#64748b', ink: '#0f172a' },
  executive: { accent: '#111827', muted: '#6b7280', ink: '#111827' },
  creative: { accent: '#7c3aed', muted: '#64748b', ink: '#111827' },
  ats_simple: { accent: '#111827', muted: '#4b5563', ink: '#111827' }
};

const clean = (value: unknown) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const collectPdfBuffer = (doc: PDFKit.PDFDocument) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });

const loadImage = async (photoUrl?: string | null) => {
  if (!photoUrl || !/^https?:\/\//i.test(photoUrl)) return null;
  try {
    const response = await fetch(photoUrl);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !/^image\/(png|jpe?g)$/i.test(contentType)) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
};

const sectionTitle = (doc: PDFKit.PDFDocument, title: string, palette: PdfPalette) => {
  doc.moveDown(0.8);
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(palette.accent)
    .text(title.toUpperCase(), { characterSpacing: 1.1 });
  doc.moveTo(doc.x, doc.y + 2).lineTo(540, doc.y + 2).strokeColor('#e5e7eb').lineWidth(0.6).stroke();
  doc.moveDown(0.45);
};

const bullet = (doc: PDFKit.PDFDocument, value: string, options: PDFKit.Mixins.TextOptions = {}) => {
  const text = clean(value);
  if (!text) return;
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#111827')
    .text(`- ${text}`, { lineGap: 2, ...options });
};

const writeListSection = (doc: PDFKit.PDFDocument, title: string, items: string[], palette: PdfPalette) => {
  const cleanItems = items.map(clean).filter(Boolean);
  if (!cleanItems.length) return;
  sectionTitle(doc, title, palette);
  cleanItems.forEach((item) => bullet(doc, item));
};

const writeInlineList = (doc: PDFKit.PDFDocument, title: string, items: string[], palette: PdfPalette) => {
  const cleanItems = items.map(clean).filter(Boolean);
  if (!cleanItems.length) return;
  sectionTitle(doc, title, palette);
  doc.font('Helvetica').fontSize(9.5).fillColor(palette.ink).text(cleanItems.join(' | '), { lineGap: 3 });
};

export const ResumePdfService = {
  async renderPdf(input: RenderInput) {
    const palette = templatePalettes[input.template] || templatePalettes.professional;
    const resume: Partial<ResumeGenerationOutput> =
      input.resume && typeof input.resume === 'object' && !Array.isArray(input.resume) ? input.resume : {};
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 44, left: 52, right: 52, bottom: 48 },
      info: {
        Title: `Scrolith Resume - ${clean(input.profile.name) || 'Professional'}`,
        Author: clean(input.profile.name) || 'Scrolith'
      }
    });

    const shouldRenderPhoto = input.includePhoto && input.template !== 'ats_simple';
    const photo = shouldRenderPhoto ? await loadImage(input.photoUrl) : null;

    if (input.template === 'creative') {
      doc.rect(0, 0, 145, 792).fill('#f8fafc');
      doc.fillColor(palette.ink);
    }

    if (photo) {
      try {
        doc.image(photo, 462, 44, { fit: [72, 72], align: 'center', valign: 'center' });
      } catch {
        doc.font('Helvetica').fontSize(8).fillColor(palette.muted).text('Profile photo unavailable', 430, 44, { width: 110 });
      }
    }

    const headerWidth = photo ? 390 : 488;
    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(palette.ink)
      .text(clean(input.profile.name) || 'Scrolith Professional', 52, 48, { width: headerWidth });
    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor(palette.accent)
      .text(clean(resume.headline || input.targetRole || input.profile.title), { width: headerWidth });

    const contact = [input.profile.location, ...(input.profile.links || []).map((link) => link.url)].map(clean).filter(Boolean);
    if (contact.length) {
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(8.5).fillColor(palette.muted).text(contact.join(' | '), { width: headerWidth });
    }

    doc.moveDown(1.1);
    writeListSection(doc, 'Professional Summary', [resume.professionalSummary], palette);
    writeInlineList(doc, 'Core Skills', resume.coreSkills || [], palette);
    writeInlineList(doc, 'Technical Skills', resume.technicalSkills || [], palette);

    const experience = resume.workExperience || [];
    if (experience.length) {
      sectionTitle(doc, 'Experience', palette);
      experience.forEach((item) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(palette.ink)
          .text([item.title, item.company].map(clean).filter(Boolean).join(' - '));
        const meta = [item.location, item.startDate, item.endDate].map(clean).filter(Boolean).join(' | ');
        if (meta) doc.font('Helvetica').fontSize(8.5).fillColor(palette.muted).text(meta);
        (item.highlights || []).forEach((highlight) => bullet(doc, highlight));
        doc.moveDown(0.35);
      });
    }

    const services = resume.freelanceServices || [];
    if (services.length) {
      sectionTitle(doc, 'Freelance Services', palette);
      services.forEach((service) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(palette.ink).text(clean(service.name));
        doc.font('Helvetica').fontSize(9.5).fillColor(palette.ink).text(clean(service.description), { lineGap: 2 });
        (service.proofPoints || []).forEach((point) => bullet(doc, point));
        doc.moveDown(0.25);
      });
    }

    const projects = resume.projects || [];
    if (projects.length) {
      sectionTitle(doc, 'Projects', palette);
      projects.forEach((project) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(palette.ink).text(clean(project.name));
        doc.font('Helvetica').fontSize(9.5).fillColor(palette.ink).text(clean(project.description), { lineGap: 2 });
        if (project.technologies?.length) bullet(doc, `Technologies: ${project.technologies.join(', ')}`);
        if (project.impact) bullet(doc, `Impact: ${project.impact}`);
        if (project.url) bullet(doc, `URL: ${project.url}`);
        doc.moveDown(0.25);
      });
    }

    writeListSection(
      doc,
      'Education',
      (resume.education || []).map((item) => [item.school, item.degree, item.field, item.year].map(clean).filter(Boolean).join(' - ')),
      palette
    );
    writeListSection(
      doc,
      'Certifications',
      (resume.certifications || []).map((item) => [item.name, item.issuer, item.year].map(clean).filter(Boolean).join(' - ')),
      palette
    );
    writeListSection(doc, 'Links', (resume.links || []).map((item) => `${clean(item.label)}: ${clean(item.url)}`), palette);

    return collectPdfBuffer(doc);
  }
};
