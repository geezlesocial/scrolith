/**
 * Phase 20.7.4 — Display-time plain-text normalization for Scrolitha messages.
 * Historical DM bodies may still contain Markdown emphasis; Messages renders plain text.
 * Do not mutate human messages — only apply when isScrolitha-authored content.
 */

/** Strip common Markdown emphasis for plain-text bubbles (Messages / dock). */
export const normalizeScrolithaDisplayText = (text: string): string => {
  let out = String(text || '').replace(/\r\n/g, '\n');
  if (!out) return '';

  // Protect fenced code
  const fences: string[] = [];
  out = out.replace(/```[\s\S]*?```/g, (block) => {
    const i = fences.length;
    fences.push(block);
    return `\u0000F${i}\u0000`;
  });

  out = out.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  out = out.replace(/__([^_\n]+)__/g, '$1');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2');
  out = out.replace(/~~([^~\n]+)~~/g, '$1');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  out = out.replace(/^#{1,6}\s+/gm, '');
  // leftover emphasis markers from broken pairs
  out = out.replace(/\*\*/g, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  out = out.replace(/\u0000F(\d+)\u0000/g, (_m, idx) => {
    const block = fences[Number(idx)] || '';
    return block.replace(/^```[a-zA-Z0-9]*\n?/, '').replace(/\n?```$/, '').trim();
  });

  return out;
};

export const isScrolithaAuthoredMessage = (msg: any): boolean =>
  Boolean(
    msg?.isScrolitha ||
      msg?.is_scrolitha ||
      msg?.metadata?.scrolitha === true ||
      msg?.metadata?.kind === 'assistant_reply' ||
      msg?.metadata?.kind === 'error_fallback'
  );
