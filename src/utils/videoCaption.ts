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

export const buildAttachmentCaptionMap = (media: any[] | undefined | null, caption: unknown) => {
  const normalized = normalizeCaption(caption);
  if (!normalized) return {};
  const map: Record<string, string> = {};
  for (const item of Array.isArray(media) ? media : []) {
    const ids = mediaIdentityKeys(item);
    const primaryId = ids[0];
    if (primaryId) map[primaryId] = normalized;
  }
  return map;
};

export const resolveFirstAttachmentCaption = (container: any, media?: any[] | undefined | null) => {
  const items = Array.isArray(media) ? media : Array.isArray(container?.attachments) ? container.attachments : [];
  for (const item of items) {
    const caption = resolveVideoCaption(container, item);
    if (caption) return caption;
  }
  return '';
};

export const resolveVideoCaption = (container: any, media?: any) => {
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

  return '';
};
