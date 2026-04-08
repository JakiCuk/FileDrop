# =============================================================================
# Multi-stage build: admin SPA + frontend SPA, served by single nginx.
# Build context: repo root (so we can COPY both admin/ and frontend/).
# =============================================================================

# --- Stage 1: build admin SPA -----------------------------------------------
FROM node:20-alpine AS admin-builder
WORKDIR /app
COPY admin/package.json ./
RUN npm install
COPY admin/ ./
RUN npm run build

# --- Stage 2: build frontend SPA with branding placeholders -----------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 3: nginx runtime --------------------------------------------------
FROM nginx:alpine
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=admin-builder    /app/dist /usr/share/nginx/html/admin
COPY frontend/nginx/nginx-http.conf /etc/nginx/conf.d/nginx-http.conf
COPY frontend/nginx/nginx-ssl.conf  /etc/nginx/conf.d/nginx-ssl.conf
COPY frontend/docker-entrypoint.sh /docker-entrypoint-filedrop.sh
RUN chmod +x /docker-entrypoint-filedrop.sh

EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint-filedrop.sh"]
