export type StaticPageTocItem = {
  id: string;
  title: string;
  level: 2 | 3;
};

type PreparedStaticPageContent = {
  html: string;
  toc: StaticPageTocItem[];
  wordCount: number;
  readingMinutes: number;
  lead: string;
};

const slugifyHeading = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const decodeEntities = (value: string) => {
  if (typeof window === 'undefined') return value;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const SHORT_SECTION_LABELS = new Set([
  'summary',
  'contact',
  'scope',
  'overview',
  'refunds',
  'privacy',
  'security',
  'cookies',
  'support',
  'governing law',
  'changes to these terms',
  'changes to this policy'
]);

const stripTrailingPunctuation = (value: string) => String(value || '').trim().replace(/[.:;,!?]+$/, '');

const isStandaloneHeading = (text: string, nextTag = '') => {
  const normalized = stripTrailingPunctuation(text).toLowerCase();
  if (!normalized) return false;
  if (SHORT_SECTION_LABELS.has(normalized)) return true;
  if (nextTag === 'UL' || nextTag === 'OL') return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 10) return false;
  if (/[.!?]$/.test(text.trim())) return false;
  return words.every((word) => word.length <= 30);
};

const isSubheadingCandidate = (text: string, nextTag = '') => {
  const normalized = stripTrailingPunctuation(text);
  if (!normalized) return false;
  if (nextTag === 'P' || nextTag === 'UL') {
    const words = normalized.split(/\s+/).filter(Boolean);
    return words.length > 0 && words.length <= 6 && !/[.!?]$/.test(text.trim());
  }
  return false;
};

const formatMarkdownLinks = (value: string) =>
  value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/gi, (_match, label, url) => {
    const safeUrl = escapeHtml(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  });

const formatInlinePlainText = (line: string) => {
  let output = escapeHtml(line);
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  output = output.replace(/__([^_]+)__/g, '<u>$1</u>');
  output = formatMarkdownLinks(output);
  output = output.replace(
    /((https?:\/\/|www\.)[^\s<]+)/gi,
    (match) =>
      `<a href="${match.startsWith('http') ? match : `https://${match}`}" target="_blank" rel="noopener noreferrer">${match}</a>`
  );
  return output;
};

const mergeAdjacentLists = (body: HTMLElement) => {
  let current = body.firstElementChild;
  while (current) {
    const currentTag = current.tagName;
    if (currentTag === 'UL' || currentTag === 'OL') {
      let next = current.nextElementSibling;
      while (next && next.tagName === currentTag) {
        const nextItems = Array.from(next.children);
        nextItems.forEach((item) => current?.appendChild(item));
        const nextRef = next.nextElementSibling;
        next.remove();
        next = nextRef;
      }
    }
    current = current.nextElementSibling;
  }
};

const replaceShortcodes = (source: string) => {
  const parseAttributes = (raw: string) => {
    const attrs: Record<string, string> = {};
    const regex = /([a-zA-Z_]+)=["']([^"']*)["']/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw))) {
      attrs[match[1]] = match[2];
    }
    return attrs;
  };

  return String(source || '')
    .replace(/\[scrolith_ad([^\]]*)\]/gi, (_match, rawAttributes) => {
      const attrs = parseAttributes(rawAttributes);
      const sponsor = escapeHtml(attrs.sponsor || attrs.label || 'Sponsored');
      const title = escapeHtml(attrs.title || 'Promoted');
      const body = escapeHtml(attrs.body || 'Use this area for partner messaging, announcements, or internal campaigns.');
      const ctaText = escapeHtml(attrs.cta_text || attrs.cta || 'Learn more');
      const ctaUrl = escapeHtml(attrs.cta_url || attrs.url || '/support');
      const imageUrl = attrs.image ? escapeHtml(attrs.image) : '';

      return `
        <aside class="inline-ad-slot">
          <div class="inline-ad-slot__label">${sponsor}</div>
          <div class="inline-ad-slot__body">
            <div class="inline-ad-slot__copy">
              <h3>${title}</h3>
              <p>${body}</p>
              <a href="${ctaUrl}" class="inline-ad-slot__cta">${ctaText}</a>
            </div>
            ${imageUrl ? `<img src="${imageUrl}" alt="${title}" class="inline-ad-slot__image" loading="lazy" />` : ''}
          </div>
        </aside>
      `.trim();
    })
    .replace(/\[scrolith_cta([^\]]*)\]/gi, (_match, rawAttributes) => {
      const attrs = parseAttributes(rawAttributes);
      const title = escapeHtml(attrs.title || 'Continue with Scrolith');
      const body = escapeHtml(attrs.body || 'Explore more resources, support, and marketplace tools on Scrolith.');
      const ctaText = escapeHtml(attrs.cta_text || attrs.cta || 'Visit support');
      const ctaUrl = escapeHtml(attrs.cta_url || attrs.url || '/support');

      return `
        <section class="page-inline-cta">
          <div class="page-inline-cta__eyebrow">Continue</div>
          <h3>${title}</h3>
          <p>${body}</p>
          <a href="${ctaUrl}" class="page-inline-cta__button">${ctaText}</a>
        </section>
      `.trim();
    });
};

export const htmlToPlainText = (html: string) => {
  const source = String(html || '').replace(/\r\n/g, '\n');
  const withBreaks = source
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|section|article|h1|h2|h3|h4|h5|h6|blockquote|pre)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*li\s*>/gi, '')
    .replace(/<\s*\/\s*(ul|ol)\s*>/gi, '\n')
    .replace(/\[scrolith_(ad|cta)[^\]]*\]/gi, '');
  const withoutTags = withBreaks.replace(/<[^>]*>/g, '');
  return decodeEntities(withoutTags)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const plainTextToHtml = (plainText: string) => {
  const lines = String(plainText || '').replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let paragraphBuffer: string[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    const paragraph = paragraphBuffer.join(' ').trim();
    if (paragraph) html.push(`<p>${formatInlinePlainText(paragraph)}</p>`);
    paragraphBuffer = [];
  };

  const flushUl = () => {
    if (!ulItems.length) return;
    html.push(`<ul>\n${ulItems.map((item) => `  <li>${item}</li>`).join('\n')}\n</ul>`);
    ulItems = [];
  };

  const flushOl = () => {
    if (!olItems.length) return;
    html.push(`<ol>\n${olItems.map((item) => `  <li>${item}</li>`).join('\n')}\n</ol>`);
    olItems = [];
  };

  const flushStructured = () => {
    flushParagraph();
    flushUl();
    flushOl();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushStructured();
      continue;
    }

    const imageMatch = line.match(/^\[(?:image|Image):\s*([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/);
    if (imageMatch) {
      flushStructured();
      html.push(
        `<figure><img src="${escapeHtml(imageMatch[2])}" alt="${escapeHtml(imageMatch[1])}" loading="lazy" /></figure>`
      );
      continue;
    }

    const videoMatch = line.match(/^\[(?:video|Video):\s*([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)$/);
    if (videoMatch) {
      flushStructured();
      html.push(
        `<figure><video src="${escapeHtml(videoMatch[2])}" controls playsinline preload="metadata"></video><figcaption>${escapeHtml(
          videoMatch[1]
        )}</figcaption></figure>`
      );
      continue;
    }

    if (/^\[scrolith_(ad|cta)[^\]]*\]$/i.test(line)) {
      flushStructured();
      html.push(line);
      continue;
    }

    if (/^---+$/.test(line)) {
      flushStructured();
      html.push('<hr />');
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      flushOl();
      ulItems.push(formatInlinePlainText(line.replace(/^[-*]\s+/, '')));
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const headingText = line.replace(/^\d+\.\s+/, '').trim();
      const headingWords = headingText.split(/\s+/).filter(Boolean);
      if (headingWords.length <= 10 && !/[.!?]$/.test(headingText)) {
        flushStructured();
        html.push(`<h2>${formatInlinePlainText(line)}</h2>`);
        continue;
      }
      flushParagraph();
      flushUl();
      olItems.push(formatInlinePlainText(headingText));
      continue;
    }

    if (/^###\s+/.test(line)) {
      flushStructured();
      html.push(`<h3>${formatInlinePlainText(line.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }

    if (/^##\s+/.test(line)) {
      flushStructured();
      html.push(`<h2>${formatInlinePlainText(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }

    if (/^#\s+/.test(line)) {
      flushStructured();
      html.push(`<h1>${formatInlinePlainText(line.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }

    if (/^>\s+/.test(line)) {
      flushStructured();
      html.push(`<blockquote>${formatInlinePlainText(line.replace(/^>\s+/, ''))}</blockquote>`);
      continue;
    }

    if (isStandaloneHeading(line)) {
      flushStructured();
      html.push(`<h2>${formatInlinePlainText(line)}</h2>`);
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushStructured();
  return html.length ? html.join('\n') : '<p></p>';
};

export const normalizeLegacyPageHtml = (html: string) => {
  if (!html || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return replaceShortcodes(html);
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${replaceShortcodes(html)}</body>`, 'text/html');
    const body = doc.body;

    mergeAdjacentLists(body);

    Array.from(body.children).forEach((element, index, elements) => {
      const nextTag = elements[index + 1]?.tagName || '';

      if (element.tagName === 'P') {
        const text = element.textContent?.trim() || '';
        if (!text) return;

        if (/^effective date:/i.test(text)) {
          element.classList.add('page-effective-date');
          return;
        }

        if (isStandaloneHeading(text, nextTag)) {
          const heading = doc.createElement('h2');
          heading.innerHTML = element.innerHTML;
          element.replaceWith(heading);
          return;
        }

        if (isSubheadingCandidate(text, nextTag)) {
          const subheading = doc.createElement('h3');
          subheading.innerHTML = element.innerHTML;
          element.replaceWith(subheading);
        }
        return;
      }

      if ((element.tagName === 'OL' || element.tagName === 'UL') && element.children.length === 1) {
        const child = element.children[0];
        const text = child.textContent?.trim() || '';
        if (/^\d+\.\s+/.test(text) || isStandaloneHeading(text)) {
          const heading = doc.createElement('h2');
          heading.innerHTML = formatInlinePlainText(text);
          element.replaceWith(heading);
          return;
        }
      }
    });

    mergeAdjacentLists(body);
    return body.innerHTML || replaceShortcodes(html);
  } catch (error) {
    console.error('Failed to normalize legacy page HTML', error);
    return replaceShortcodes(html);
  }
};

export const prepareStaticPageContent = (html: string): PreparedStaticPageContent => {
  const normalizedHtml = normalizeLegacyPageHtml(html);
  if (!normalizedHtml || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    const text = String(normalizedHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    return {
      html: normalizedHtml,
      toc: [],
      wordCount,
      readingMinutes: wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 220)) : 0,
      lead: ''
    };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${normalizedHtml}</body>`, 'text/html');
    const toc: StaticPageTocItem[] = [];
    const usedIds = new Set<string>();

    doc.querySelectorAll('h2, h3').forEach((heading, index) => {
      const text = heading.textContent?.trim() || `section-${index + 1}`;
      let id = slugifyHeading(text) || `section-${index + 1}`;
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      heading.setAttribute('id', id);
      toc.push({
        id,
        title: text,
        level: heading.tagName === 'H3' ? 3 : 2
      });
    });

    const paragraphs = Array.from(doc.querySelectorAll('p'))
      .map((node) => node.textContent?.trim() || '')
      .filter(Boolean);
    const lead = paragraphs.find((text) => text.length > 80) || paragraphs[0] || '';
    const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

    return {
      html: doc.body.innerHTML || normalizedHtml,
      toc,
      wordCount,
      readingMinutes: wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 220)) : 0,
      lead
    };
  } catch (error) {
    console.error('Failed to prepare static page content', error);
    const text = String(normalizedHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    return {
      html: normalizedHtml,
      toc: [],
      wordCount,
      readingMinutes: wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 220)) : 0,
      lead: ''
    };
  }
};
