import { allowedResumeMimeTypes, MAX_RESUME_UPLOAD_BYTES } from './resume.validation';

export type ParsedResumeFile = {
  text: string;
  detectedMimeType: string;
  qualityWarnings: string[];
};

const trimText = (value: string, maxLength = 40000) =>
  String(value || '')
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);

const sniffMimeType = (buffer: Buffer, declared: string) => {
  if (buffer.subarray(0, 4).toString('hex') === '25504446') return 'application/pdf';
  if (buffer.subarray(0, 4).toString('hex') === '504b0304') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buffer.subarray(0, 12).toString('utf8').startsWith('RIFF') && buffer.subarray(8, 12).toString('utf8') === 'WEBP') return 'image/webp';
  return declared || 'application/octet-stream';
};

const parseWithOptionalPdfParse = async (buffer: Buffer) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    return trimText(parsed?.text || '');
  } catch {
    return '';
  }
};

const parseWithOptionalMammoth = async (buffer: Buffer) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth');
    const parsed = await mammoth.extractRawText({ buffer });
    return trimText(parsed?.value || '');
  } catch {
    return '';
  }
};

const parseWithTesseract = async (buffer: Buffer) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tesseract = require('tesseract.js');
    const result = await tesseract.recognize(buffer, 'eng', {
      logger: undefined
    });
    return trimText(result?.data?.text || '');
  } catch {
    return '';
  }
};

const extractReadableAscii = (buffer: Buffer) => {
  const raw = buffer.toString('latin1');
  const cleaned = raw
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return trimText(cleaned);
};

export const ResumeParserService = {
  validateUpload(file?: Express.Multer.File | null) {
    if (!file) {
      return { ok: false, error: 'Resume/CV file is required.' };
    }
    if (file.size > MAX_RESUME_UPLOAD_BYTES) {
      return { ok: false, error: 'Resume/CV file exceeds the 10 MB upload limit.' };
    }
    const detectedMimeType = sniffMimeType(file.buffer, file.mimetype);
    if (!allowedResumeMimeTypes.has(detectedMimeType) && !allowedResumeMimeTypes.has(file.mimetype)) {
      return { ok: false, error: 'Unsupported resume/CV file type.' };
    }
    return { ok: true, detectedMimeType };
  },

  async parseUpload(file: Express.Multer.File): Promise<ParsedResumeFile> {
    const detectedMimeType = sniffMimeType(file.buffer, file.mimetype);
    const warnings: string[] = [];
    let text = '';

    if (detectedMimeType === 'text/plain') {
      text = trimText(file.buffer.toString('utf8'));
    } else if (detectedMimeType === 'application/pdf') {
      text = await parseWithOptionalPdfParse(file.buffer);
      if (!text) {
        text = extractReadableAscii(file.buffer);
        warnings.push('PDF text extraction was limited. If this is a scanned resume, upload a text-based PDF or DOCX for better analysis.');
      }
    } else if (detectedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      text = await parseWithOptionalMammoth(file.buffer);
      if (!text) {
        text = extractReadableAscii(file.buffer);
        warnings.push('DOCX text extraction was limited. Some formatting or content may not have been captured.');
      }
    } else if (detectedMimeType === 'application/msword') {
      text = extractReadableAscii(file.buffer);
      warnings.push('Legacy DOC parsing is best-effort. DOCX or PDF uploads produce better results.');
    } else if (detectedMimeType.startsWith('image/')) {
      text = await parseWithTesseract(file.buffer);
      if (!text) {
        warnings.push('Image OCR could not extract usable text. Upload PDF, DOCX, or TXT for better analysis.');
      } else {
        warnings.push('Image OCR was used. Human review should verify extraction accuracy.');
      }
    }

    if (!text) {
      warnings.push('No usable resume text was extracted. The analysis will be marked as insufficient evidence.');
    }

    return {
      text,
      detectedMimeType,
      qualityWarnings: warnings
    };
  }
};
