FROM node:20-alpine

RUN apk add --no-cache openssl postgresql16-client

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]
