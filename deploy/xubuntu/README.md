# Xubuntu Production

## Prerequisites

- Xubuntu 22.04 LTS or newer
- Git
- Apache2
- PHP and required extensions
- Chromium

## Install packages

```bash
sudo apt update
sudo apt install -y git curl unzip apache2 php libapache2-mod-php php-cli php-mysql php-curl php-mbstring php-xml php-zip chromium
```

## Clone

```bash
cd /var/www
sudo git clone https://github.com/blackmevally/dashboard_ss.git
cd dashboard_ss
sudo git checkout main
sudo chown -R www-data:www-data /var/www/dashboard_ss
```

For development only:

```bash
sudo git checkout dev
sudo git pull origin dev
```

## Apache

Copy the supplied virtual-host configuration:

```bash
sudo cp deploy/xubuntu/apache.conf /etc/apache2/sites-available/dashboard_ss.conf
sudo a2ensite dashboard_ss.conf
sudo a2enmod rewrite
sudo systemctl reload apache2
```

If the application's public document root is not `/var/www/dashboard_ss`, adjust `apache.conf` before enabling it.

## Configure

Create local/production configuration according to the application's configuration structure. Keep secrets outside Git.

Do not commit passwords, API keys, tokens, certificates, or production database credentials.

## Kiosk

Make the launcher executable:

```bash
chmod +x deploy/xubuntu/start-kiosk.sh
```

Edit the `URL` variable if needed, then test:

```bash
./deploy/xubuntu/start-kiosk.sh
```

For automatic startup, add the launcher to Xubuntu's **Settings → Session and Startup → Application Autostart** or create an equivalent desktop autostart entry.

## Update

```bash
cd /var/www/dashboard_ss
sudo git checkout main
sudo git pull origin main
sudo systemctl reload apache2
```

Restart the Chromium kiosk if required.
