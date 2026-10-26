FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib/db/bootstrap.ts ./src/lib/db/bootstrap.ts
EXPOSE 3000
# Her açılışta bekleyen migration'lar uygulanır; veri varsa tohum yüklenmez.
CMD ["sh", "-c", "node --disable-warning=ExperimentalWarning scripts/db-setup.mts && npx next start -p 3000"]
