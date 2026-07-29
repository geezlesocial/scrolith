const normalizeCaption = (value: unknown, maxLength = 420) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
};

const captionKeys = ['caption', 'description', 'altText', 'alt_text', 'title', 'name'];

const mediaIdentityKeys = (media: any) =>
  [
    media?.id,
    media?.fileId,
    media?.file_id,
    media?.file?.id,
    media?.asset?.id,
    media?.mediaFileId,
    media?.media_file_id,
    media?.url
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

export const resolveVideoCaption = (container: any, media?: any, fallback?: unknown) => {
  for (const key of captionKeys) {
    const candidate = normalizeCaption(media?.[key]);
    if (candidate) return candidate;
  }

  const captionMaps = [
    container?.attachmentCaptions,
    container?.attachment_captions,
    container?.mediaCaptions,
    container?.media_captions
  ];
  const identityKeys = mediaIdentityKeys(media);

  for (const captionMap of captionMaps) {
    if (!captionMap || typeof captionMap !== 'object') continue;
    for (const key of identityKeys) {
      const candidate = normalizeCaption((captionMap as Record<string, unknown>)[key]);
      if (candidate) return candidate;
    }
  }

  for (const key of ['caption', 'content', 'body', 'description', 'title']) {
    const candidate = normalizeCaption(container?.[key]);
    if (candidate) return candidate;
  }

  return normalizeCaption(fallback);
};
