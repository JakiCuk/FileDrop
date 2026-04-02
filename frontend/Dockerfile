FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN VITE_COMPANY_LOGO_URL="__VITE_COMPANY_LOGO_URL__" VITE_COMPANY_NAME="__VITE_COMPANY_NAME__" npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Entrypoint script: replaces placeholders with env vars, then starts nginx
RUN cat <<'SCRIPT' > /docker-entrypoint-filedrop.sh
#!/bin/sh
set -e

# --- Runtime branding substitution ---
COMPANY_NAME="${VITE_COMPANY_NAME:-FileDrop}"
LOGO_URL="${VITE_COMPANY_LOGO_URL:-}"

echo "[FileDrop] Applying branding: name=$COMPANY_NAME, logo=$LOGO_URL"

# Replace placeholders in all JS and HTML files
find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.html' \) -exec \
  sed -i "s|__VITE_COMPANY_NAME__|${COMPANY_NAME}|g" {} +

find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.html' \) -exec \
  sed -i "s|__VITE_COMPANY_LOGO_URL__|${LOGO_URL}|g" {} +

# Also replace the <title> tag in index.html
sed -i "s|<title>__VITE_COMPANY_NAME__</title>|<title>${COMPANY_NAME}</title>|g" \
  /usr/share/nginx/html/index.html

# --- SSL mode selection ---
if [ "$SSL_MODE" = "docker" ]; then
  echo "[FileDrop] SSL_MODE=docker — using SSL config (port 443)"
  if [ ! -f /etc/nginx/ssl/cert.pem ] || [ ! -f /etc/nginx/ssl/key.pem ]; then
    echo "[FileDrop] ERROR: SSL certificate not found at /etc/nginx/ssl/cert.pem and /etc/nginx/ssl/key.pem"
    echo "[FileDrop] Mount your certificates via Docker volume: ./certs:/etc/nginx/ssl:ro"
    exit 1
  fi
  cp /etc/nginx/conf.d/nginx-ssl.conf /etc/nginx/nginx.conf
else
  echo "[FileDrop] SSL_MODE=external — using HTTP config (port 80, SSL terminated by external proxy)"
  cp /etc/nginx/conf.d/nginx-http.conf /etc/nginx/nginx.conf
fi

exec nginx -g 'daemon off;'
SCRIPT
chmod +x /docker-entrypoint-filedrop.sh

EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint-filedrop.sh"]
