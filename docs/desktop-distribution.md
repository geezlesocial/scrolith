## Scrolith Desktop Distribution

This desktop package uses Electron Builder and produces two Windows deliverables:

- `desktop-dist/Scrolith-Desktop-Setup-<version>-x64.exe`
- `desktop-dist/Scrolith-Desktop-Portable-<version>-x64.exe`

### Build commands

```powershell
npm run build
npm run desktop:dist
```

### Current runtime target

The packaged app opens the live Scrolith web experience by default:

- `https://scrolith.com`

Override for a private environment if needed:

```powershell
$env:SCROLITH_DESKTOP_URL="https://staging.scrolith.com"
npm run desktop:dist
```

### Optional code signing

Unsigned builds will run, but signed builds are strongly recommended for public distribution.

Electron Builder supports Windows signing through standard certificate variables such as:

```powershell
$env:CSC_LINK="C:\secure\scrolith-desktop-cert.pfx"
$env:CSC_KEY_PASSWORD="your-password"
```

Then rebuild:

```powershell
npm run desktop:dist
```

Recommended production signing inputs:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

Optional Windows-specific overrides:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Signed production installers should be built on a trusted release machine or CI runner that holds the signing certificate securely.

Use this Google Cloud secret for release publishing:

- `GCP_DESKTOP_RELEASE_SA_KEY` with Storage Object Admin access to `gs://downloads.scrolith.com`

### Optional auto-update readiness

Scrolith desktop now includes update-check wiring through Electron Updater using a Scrolith-controlled generic feed.

Default feed:

- `https://storage.googleapis.com/downloads.scrolith.com/desktop/win`

Runtime override:

```powershell
$env:SCROLITH_DESKTOP_UPDATE_URL="https://storage.googleapis.com/downloads.scrolith.com/desktop/win"
```

When Scrolith is ready for managed desktop updates, use:

1. A signed Windows build
2. A trusted update host serving `latest.yml` and installer artifacts over HTTPS
3. An Electron auto-update integration that points only to Scrolith-controlled infrastructure

Keep update hosting under Scrolith ownership. Do not depend on third-party public file hosts for production desktop updates.

To disable updater checks for a packaged environment:

```powershell
$env:SCROLITH_DISABLE_AUTO_UPDATE="1"
```

### Release hosting

Desktop release origin bucket:

- `gs://downloads.scrolith.com/desktop/win`

Published URLs:

- Installer alias: `https://storage.googleapis.com/downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-latest-x64.exe`
- Portable alias: `https://storage.googleapis.com/downloads.scrolith.com/desktop/win/Scrolith-Desktop-Portable-latest-x64.exe`
- Auto-update feed: `https://storage.googleapis.com/downloads.scrolith.com/desktop/win/latest.yml`

Production vanity URLs:

- `https://downloads.scrolith.com/desktop/win/Scrolith-Desktop-Setup-latest-x64.exe`
- `https://downloads.scrolith.com/desktop/win/latest.yml`

DNS cutover required at Namecheap:

- Type: `A`
- Host: `downloads`
- Value: `136.68.253.165`
- TTL: automatic or 5 minutes during rollout

Provisioned Google Cloud edge resources:

- Global IP: `scrolith-downloads-ip`
- Backend bucket: `scrolith-downloads-bucket`
- URL map: `scrolith-downloads-map`
- HTTPS proxy: `scrolith-downloads-https-proxy`
- Managed certificate: `scrolith-downloads-ssl`

### CI release workflow

Use `.github/workflows/desktop-release.yml` for signed Windows release generation and bucket publishing. The workflow:

1. validates desktop signing secrets
2. builds signed NSIS and portable artifacts on `windows-latest`
3. uploads versioned artifacts and stable aliases to `gs://downloads.scrolith.com/desktop/win`
4. refreshes cache headers for installer aliases and `latest.yml`
5. attaches the same artifacts to a GitHub release when triggered from a `desktop-v*` tag
