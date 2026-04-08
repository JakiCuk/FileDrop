#!/bin/sh
set -e

# --- Runtime branding substitution ---
COMPANY_NAME="${VITE_COMPANY_NAME:-FileDrop}"
LOGO_URL="${VITE_COMPANY_LOGO_URL:-}"

# Escape backslashes and double quotes so values can't break out of the JS string literal
escape_js() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}
COMPANY_NAME_JS=$(escape_js "$COMPANY_NAME")
LOGO_URL_JS=$(escape_js "$LOGO_URL")

echo "[FileDrop] Applying branding: name=$COMPANY_NAME, logo=$LOGO_URL"

# Generate runtime env file consumed by the SPA before main.tsx loads
cat > /usr/share/nginx/html/env.js <<EOF
window.__ENV__ = {
  VITE_COMPANY_NAME: "${COMPANY_NAME_JS}",
  VITE_COMPANY_LOGO_URL: "${LOGO_URL_JS}"
};
EOF

# Update <title> in index.html (HTML is not bundled, sed is safe here)
sed -i "s|<title>FileDrop</title>|<title>${COMPANY_NAME}</title>|g" \
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
