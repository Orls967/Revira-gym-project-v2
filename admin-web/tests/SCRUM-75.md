# SCRUM-75 transaction regression

Run the suite from `admin-web` after installing the project dependencies. It uses the real Transaksi page in a loopback Vite server, with a local Chromium browser and intercepted API responses. It requires no Laravel instance, database, or real credentials.

Install Playwright Core 1.58.2 in a separate directory and point the suite at that installation and your local Chromium-family executable. Example for PowerShell.

```powershell
$qaTools = Join-Path $env:TEMP 'revira-scrum75-tools'
npm.cmd install --prefix $qaTools playwright-core@1.58.2 --ignore-scripts --no-audit --no-fund
$env:SCRUM75_PLAYWRIGHT = Join-Path $qaTools 'node_modules/playwright-core'
$env:SCRUM75_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test --test-timeout=25000 tests/scrum75-regression.test.mjs
```

An existing `playwright-core` installation on the module path can be used without `SCRUM75_PLAYWRIGHT`. If Playwright's managed Chromium is already installed, the browser executable override can also be left unset.

## Optional mock mode

The normal development server uses the configured Laravel API. For isolated UI demonstrations, start Vite with the mock flag set.

```powershell
$env:VITE_SCRUM75_MOCK = 'true'
npm.cmd run dev
```

The simulation banner identifies fixture data and simulated decisions. Changes survive tab changes and in-page reloads while Transaksi is mounted. Navigating away or reloading the document resets the fixtures. Receipt previews for fixture rows show a dedicated message. Clear the flag with `Remove-Item Env:VITE_SCRUM75_MOCK` and restart Vite to return to the Laravel API. Production builds ignore the flag.
