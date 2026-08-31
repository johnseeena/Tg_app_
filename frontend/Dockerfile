FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# This container's only job is to copy the built static assets into a
# shared volume Caddy serves from — it runs once and exits (see the
# frontend-build service in docker-compose.yml).
FROM alpine:3.20
COPY --from=build /app/dist /dist
CMD ["sh", "-c", "rm -rf /output/* && cp -r /dist/. /output/"]
