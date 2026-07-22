# Messaging URL Security

The URL renderer validates links before activation.

Allowed protocols:

- `http:`
- `https:`

Blocked schemes:

- `javascript:`
- `data:`
- `vbscript:`
- `file:`
- `intent:`
- `blob:`
- `about:`
- `chrome:`

Protections:

- URL length is bounded to 2048 characters.
- Control characters are rejected.
- Embedded credentials are rejected.
- Malformed URLs remain plain text.
- Email addresses are not converted to URLs.
- Internal API paths are not routed through the SPA.
- External links isolate `window.opener`.
- Link labels expose the actual target hostname for assistive technology.

