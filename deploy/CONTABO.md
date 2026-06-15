# Deploy on Contabo VPS

Run the API with Docker Compose on a Contabo VPS (Ubuntu 22.04+ recommended).

## 1. Server setup

```bash
# SSH into the VPS
ssh root@YOUR_SERVER_IP

# Install Docker (official convenience script)
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin
```

Open firewall ports you need:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5000/tcp   # only if exposing API directly without reverse proxy
ufw enable
```

## 2. Deploy the app

```bash
git clone https://github.com/tab986/movies.git
cd movies
cp .env.example .env
nano .env   # fill DATABASE_URL, JWT_SECRET, KINGUIN_API_KEY, etc.
```

**External Postgres (Supabase / managed):** set `DATABASE_URL` in `.env`, then:

```bash
docker compose up -d --build api
```

**Local Postgres on the VPS (dev / small installs):**

```bash
# In .env, point DATABASE_URL at the compose service, e.g.:
# DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres
docker compose --profile local-db up -d --build
```

Check health:

```bash
curl -s http://127.0.0.1:5000/healthz
docker compose ps
docker compose logs -f api
```

## 3. Reverse proxy (recommended)

Expose HTTPS with Nginx in front of the container:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Obtain certificates with Certbot (`certbot --nginx -d api.yourdomain.com`).

Update `.env`:

- `WAYL_WEBHOOK_URL=https://api.yourdomain.com/api/v1/orders/wayl-callback`
- `CORS_ALLOWED_ORIGINS=https://www.yourdomain.com`

## 4. Updates

```bash
cd movies
git pull
docker compose up -d --build api
```

## 5. Troubleshooting

| Issue | Action |
|-------|--------|
| Container exits on boot | Check `DATABASE_URL` and `EXIT_ON_STARTUP_DB_FAILURE` |
| 503 on `/api/v1/products` | Wait for DB startup or run once with `DB_INIT_ON_STARTUP=true` |
| Build apt errors | Retry build; see [HOST_CHECKLIST.txt](./HOST_CHECKLIST.txt) |

Health endpoint: `GET /healthz` → `{"status":"ok"}`.
