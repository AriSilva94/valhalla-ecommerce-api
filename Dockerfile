# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:20-alpine AS build

# Native deps for better-sqlite3 / sharp (image processing)
RUN apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev nasm bash vips-dev git python3

# node:20-alpine ships npm 10, but package-lock.json is generated locally with
# npm 11. A lock written by one major and installed by another has broken this
# build before, so both ends are pinned to the same version. Bump this together
# with the local npm, never one alone.
RUN npm i -g npm@11.6.2

ENV NODE_ENV=production
WORKDIR /opt/app

COPY package.json package-lock.json ./
# sharp's install script runs before npm finishes placing its optional
# @img/sharp-linuxmusl-* packages, so check.js finds no prebuilt binary and
# falls back to compiling from source, which fails for want of node-addon-api.
# npm places the correct musl binaries on its own, so sharp needs no install
# script at all — we skip scripts and rebuild only the packages that do:
# native builds (better-sqlite3) and binary fetchers (esbuild, @swc/core).
# core-js-pure only prints a funding notice and fsevents is macOS-only.
RUN npm config set fetch-retry-maxtimeout 600000 -g \
    && npm ci --ignore-scripts \
    && npm rebuild better-sqlite3 esbuild @swc/core

ENV PATH=/opt/app/node_modules/.bin:$PATH

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime

RUN apk add --no-cache vips-dev

# Same pin as the build stage — `npm run start` should not run on a different
# npm than the one the dependency tree was installed with.
RUN npm i -g npm@11.6.2

ENV NODE_ENV=production
WORKDIR /opt/app

COPY --from=build /opt/app ./

RUN chown -R node:node /opt/app
USER node

EXPOSE 1337

CMD ["npm", "run", "start"]
