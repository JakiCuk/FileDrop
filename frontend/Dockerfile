FROM node:20-alpine AS builder

ARG VITE_COMPANY_LOGO_URL=""
ARG VITE_COMPANY_NAME="ShareDrop"

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN VITE_COMPANY_LOGO_URL="$VITE_COMPANY_LOGO_URL" VITE_COMPANY_NAME="$VITE_COMPANY_NAME" npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

RUN printf '#!/bin/sh\nset -e\nif [ "$SSL_MODE" = "docker" ]; then\n  echo "[ShareDrop] SSL_MODE=docker — using SSL config (port 443)"\n  if [ ! -f /etc/nginx/ssl/cert.pem ] || [ ! -f /etc/nginx/ssl/key.pem ]; then\n    echo "[ShareDrop] ERROR: SSL certificate not found at /etc/nginx/ssl/cert.pem and /etc/nginx/ssl/key.pem"\n    echo "[ShareDrop] Mount your certificates via Docker volume: ./certs:/etc/nginx/ssl:ro"\n    exit 1\n  fi\n  cp /etc/nginx/conf.d/nginx-ssl.conf /etc/nginx/nginx.conf\nelse\n  echo "[ShareDrop] SSL_MODE=external — using HTTP config (port 80)"\n  cp /etc/nginx/conf.d/nginx-http.conf /etc/nginx/nginx.conf\nfi\nexec nginx -g "daemon off;"\n' > /docker-entrypoint-sharedrop.sh && chmod +x /docker-entrypoint-sharedrop.sh

EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint-sharedrop.sh"]
