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

### Optional auto-update readiness

The current package intentionally does not force a live auto-update channel. This keeps distribution stable until a trusted update host is configured.

When Scrolith is ready for managed desktop updates, use:

1. A signed Windows build
2. A trusted update host serving `latest.yml` and installer artifacts over HTTPS
3. An Electron auto-update integration that points only to Scrolith-controlled infrastructure

Keep update hosting under Scrolith ownership. Do not depend on third-party public file hosts for production desktop updates.
