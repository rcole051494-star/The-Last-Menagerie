FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
ENV NODE_ENV=production
EXPOSE 2567
USER node
CMD ["node", "server/index.mjs"]
