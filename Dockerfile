# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:20-alpine AS build

# Native deps for better-sqlite3 / sharp (image processing)
RUN apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev nasm bash vips-dev git python3

ENV NODE_ENV=production
WORKDIR /opt/app

COPY package.json package-lock.json ./
RUN npm config set fetch-retry-maxtimeout 600000 -g \
    && npm ci

ENV PATH=/opt/app/node_modules/.bin:$PATH

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime

RUN apk add --no-cache vips-dev

ENV NODE_ENV=production
WORKDIR /opt/app

COPY --from=build /opt/app ./

RUN chown -R node:node /opt/app
USER node

EXPOSE 1337

CMD ["npm", "run", "start"]
