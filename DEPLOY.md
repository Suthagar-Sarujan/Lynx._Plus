# Hosting LYNX._PLUS for free (Oracle Cloud Always Free + DuckDNS)

Result: your site at `https://yourname.duckdns.org`, running 24/7, with automatic HTTPS, the
worker (autopilot), MySQL, Redis and nightly database backups. Total cost: 0.

> The Docker files were prepared but could not be run on the machine they were written on (no Docker
> there). The production build itself was verified. Expect to fix small things on first start.

## 1. Free server (Oracle Cloud)

1. Sign up at https://www.oracle.com/cloud/free/ (a card is needed only to verify you; Always Free
   resources are not charged). Pick your home region carefully, it cannot be changed.
2. Create an instance: **Compute > Instances > Create**
   - Image: **Ubuntu 24.04** (aarch64)
   - Shape: **Ampere A1 Flex**, 2 OCPU, 12 GB memory (free allowance is up to 4 OCPU / 24 GB)
   - Networking: assign a public IPv4 address
   - Add your SSH public key (or download the key Oracle generates)
   - "Out of capacity"? Try again later, or another availability domain.
3. Open the ports: **Networking > your VCN > Security Lists > Add Ingress Rules** for TCP
   ports **80** and **443** (source `0.0.0.0/0`). Port 22 is already open.
4. Ubuntu on Oracle also has its own firewall. On the server:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo apt-get update && sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
   ```
5. Oracle can reclaim Always Free VMs that stay almost idle for 7 days. Avoid this by upgrading the
   account to **Pay As You Go** (resources inside the free allowance stay free).

## 2. Free domain (DuckDNS)

1. Sign in at https://www.duckdns.org (Google/GitHub login).
2. Create a subdomain (e.g. `lynxplus`) and set its **IP** to your server's public IP.
3. Your domain is now `lynxplus.duckdns.org`.

## 3. Install Docker on the server

```bash
ssh ubuntu@<server-ip>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit      # log in again so the group applies
```

## 4. Upload the project

From your PC, open **Command Prompt (cmd.exe, not PowerShell)** in the project folder. This streams the
project straight to the server without creating a file on your (possibly full) disk, and leaves out
`node_modules`, build output, your local `.env` and the generated images:

```cmd
tar --exclude=node_modules --exclude=.next --exclude=.next-build --exclude=.env --exclude=public/generated --exclude=public/uploads --exclude=.thumbs --exclude=backups -czf - . | ssh -i C:\path\to\your-oracle-key.key ubuntu@<server-ip> "mkdir -p lynx && tar -xzf - -C lynx && mkdir -p lynx/public/generated lynx/public/uploads lynx/backups"
```

Then log in and continue from the project folder:

```bash
ssh -i C:\path\to\your-oracle-key.key ubuntu@<server-ip>
cd lynx
```

(Use the same `ssh -i ...` form to log in whenever you need the server.)

## 5. Configure and start

```bash
cp .env.production.example .env.production
nano .env.production     # DOMAIN, passwords, META_* ids, ADMIN_PASSWORD, AUTH_SECRET (openssl rand -hex 32)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml logs -f web worker caddy     # Ctrl+C to leave
```

The first build takes several minutes. Caddy fetches the HTTPS certificate on its first request to
your domain (it needs ports 80/443 open and the DuckDNS record pointing at the server).

## 6. Connect Facebook / Instagram

Generate a fresh token in the Graph API Explorer, then:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec web npm run meta:connect -- <token>
```

Or sign in at `https://yourdomain/` > **Autopilot** > *Reconnect*. It stores the permanent Page token.

## 7. Go live

1. Sign in, open **Autopilot**, check "Connected".
2. Set the limits (start with 1 story per day), then switch Autopilot **on**.
3. Alerts: put a Slack/Discord webhook URL in `ALERT_WEBHOOK_URL` and restart
   (`docker compose ... up -d`).

## Moving your existing data (optional)

On your PC: `mysqldump -u root -p lynxnewsDB > lynx.sql`, copy it to the server and run
`docker compose -f docker-compose.prod.yml exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" lynx_news' < lynx.sql`.
On Linux, table names are case-sensitive: if the dump has lowercase `post`/`story`/`publishjob`
tables, rename them to `Post`/`Story`/`PublishJob` first, or simply start fresh.

## Operating it

- Update after changes: upload the new files, then `docker compose ... up -d --build`.
- Backups: nightly in `./backups` (7 days kept). Copy them off the server now and then.
- Logs: `docker compose -f docker-compose.prod.yml logs --tail 100 worker`.
- Stop everything: `docker compose -f docker-compose.prod.yml down` (data volumes are kept).
