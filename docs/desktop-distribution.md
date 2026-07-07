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

### Optional auto-update readiness

Scrolith desktop now includes update-check wiring through Electron Updater using a Scrolith-controlled generic feed.

Default feed:

- `https://downloads.scrolith.com/desktop/win`

Runtime override:

```powershell
$env:SCROLITH_DESKTOP_UPDATE_URL="https://downloads.scrolith.com/desktop/win"
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
