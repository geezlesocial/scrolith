# Messaging Clickable URLs

Message text remains stored as plain text. Rendering now tokenizes safe URL spans into React nodes through `SafeMessageText`, without `dangerouslySetInnerHTML`.

Supported formats:

- `https://example.com`
- `http://example.com`
- `www.example.com`
- `scrolith.com/profile/example`
- `https://scrolith.com/messages/join/example`

Behavior:

- Internal Scrolith routes use SPA navigation.
- External links open with `target="_blank"` and `rel="noopener noreferrer nofollow"` on web.
- External links use Capacitor Browser when running in the Android WebView.
- Historical messages become clickable because rendering is computed at display time.
- Line breaks and surrounding plain text are preserved.

Local evidence:

- `npm run build` in `geezle`: PASS.
- `npx vitest run src/utils/__tests__/messageLinks.spec.ts src/utils/__tests__/phase222MessageMentions.spec.ts`: PASS, 9 tests.

