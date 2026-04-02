#!/bin/sh
set -e

if [ "$SSL_MODE" = "docker" ]; then
    echo "[ShareDrop] SSL_MODE=docker — using SSL config (port 443)"
    if [ ! -f /etc/nginx/ssl/cert.pem ] || [ ! -f /etc/nginx/ssl/key.pem ]; then
        echo "[ShareDrop] ERROR: SSL certificate not found at /etc/nginx/ssl/cert.pem and /etc/nginx/ssl/key.pem"
        echo "[ShareDrop] Mount your certificates via Docker volume: ./certs:/etc/nginx/ssl:ro"
        exit 1
    fi
    cp /etc/nginx/conf.d/nginx-ssl.conf /etc/nginx/nginx.conf
else
    echo "[ShareDrop] SSL_MODE=external — using HTTP config (port 80, SSL terminated by external proxy)"
    cp /etc/nginx/conf.d/nginx-http.conf /etc/nginx/nginx.conf
fi

exec nginx -g 'daemon off;'
