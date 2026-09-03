# Windows Production

## Prerequisites

- Windows 10/11
- XAMPP (Apache + PHP; MySQL only if this deployment needs a local database)
- Git
- Google Chrome

## Install

Clone the production branch:

```powershell
cd C:\xampp\htdocs
git clone https://github.com/blackmevally/dashboard_ss.git
cd dashboard_ss
git checkout main
```

For development only:

```powershell
git checkout dev
git pull origin dev
```

## Configure

Keep production/local configuration outside Git. Create the required local configuration files according to the application's configuration structure.

Never commit passwords, API keys, tokens, certificates, or other production secrets.

## Test

Start Apache from XAMPP and open the application through `http://localhost/` (or the configured virtual host/path).

## Kiosk

Edit `start-kiosk.bat` and set `URL` to the final display URL, then run it.

To start automatically after Windows login, place a shortcut to `start-kiosk.bat` in:

```text
shell:startup
```

## Update

```powershell
cd C:\xampp\htdocs\dashboard_ss
git checkout main
git pull origin main
```

Restart Apache/Chrome kiosk if required.
