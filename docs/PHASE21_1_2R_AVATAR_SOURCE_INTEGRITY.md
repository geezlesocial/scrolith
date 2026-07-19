# Phase 21.1.2R — Avatar Source Integrity

`resolveProfilePhotoCandidates` rejects null/empty/object/literals. Candidates: explicit src, avatarUrl, nested media, resolveUserAvatarUrl. Initials only when no candidates or all fail after walk. Photo loads hide initials underlay.
