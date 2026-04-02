FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN VITE_COMPANY_LOGO_URL="__VITE_COMPANY_LOGO_URL__" VITE_COMPANY_NAME="__VITE_COMPANY_NAME__" npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint-filedrop.sh
RUN chmod +x /docker-entrypoint-filedrop.sh

EXPOSE 80 443
ENTRYPOINT ["/docker-entrypoint-filedrop.sh"]
