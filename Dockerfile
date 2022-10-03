FROM node:current-alpine3.15

WORKDIR /usr/src/app

# timezone
ENV TZ Asia/Shanghai

RUN apk add tzdata && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo ${TZ} > /etc/timezone \
    && apk del tzdata

COPY src ./src/
COPY tsconfig.json ./
COPY package*.json ./

RUN npm install  \
    && npm run build


CMD ["npm", "run", "start"]
