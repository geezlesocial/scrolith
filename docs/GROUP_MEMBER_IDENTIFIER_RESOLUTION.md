# Group Member Identifier Resolution

The group member form now accepts:

- Username: `jima` or `@jima`
- Exact email address: `user@example.com`
- User ID: `cmrsb0f0s05xgs601xduk3asn`

Backend endpoints:

- `POST /api/messages/conversations/:id/members/resolve`
- `GET /api/messages/conversations/:id/member-candidates`
- Existing `POST /api/messages/conversations/:id/members` remains backward compatible and now accepts `userId` or `userIds`.

Resolution precedence:

1. Exact normalized email match when input is a valid email.
2. Exact user ID match when input looks like a platform ID.
3. Exact username match after trimming a leading `@`.

Privacy:

- Email is never returned in resolver or candidate responses.
- Partial email search returns no suggestions.
- Suggestions are username-only unless the input is an exact email address.

Add flow:

1. Resolve identifier.
2. Show confirmation card.
3. Submit canonical resolved user ID.
4. Server enforces authorization, duplicate checks, block checks, privacy policy, and group capacity.

