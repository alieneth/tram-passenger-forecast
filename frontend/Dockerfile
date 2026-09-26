# Фронтенд: сборка Vite → статика в nginx. nginx же проксирует /api на бэкенд — один адрес, без CORS.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Переменные Vite вшиваются при сборке. По умолчанию API — через прокси этого же nginx,
# а методы, которых бэкенд ещё не отдаёт, подменяются моками (значок в шапке)
ARG VITE_API_URL=/api/v1
ARG VITE_MOCK_FALLBACK=true
ARG VITE_MAP_STYLE_URL=https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MOCK_FALLBACK=$VITE_MOCK_FALLBACK \
    VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL
RUN npm run build

FROM nginx:1.27-alpine
# Шаблон конфигурации: nginx подставит API_UPSTREAM при старте контейнера
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV API_UPSTREAM=http://backend:8080
EXPOSE 80
