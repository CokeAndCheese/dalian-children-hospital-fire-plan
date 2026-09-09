FROM node:22-alpine AS ai
WORKDIR /app
COPY server/proxy.mjs /app/proxy.mjs
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "/app/proxy.mjs"]

FROM nginx:1.30.4-alpine AS web

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/

EXPOSE 80
