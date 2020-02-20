FROM jrottenberg/ffmpeg:4.1-alpine AS ffmpeg
FROM node:12-alpine3.11

RUN apk add --no-cache --update libgomp expat

COPY --from=ffmpeg /usr/local /usr/local
WORKDIR /app
COPY src/docker/package.json .
RUN npm install

COPY src/docker/ .

CMD ["node", "./convert.js"]
