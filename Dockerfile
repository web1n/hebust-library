FROM node:lts-alpine3.15 AS build

WORKDIR /opt/app

COPY . .
RUN yarn && yarn build-pkg


FROM cgr.dev/chainguard/static:latest

COPY --from=build /opt/app/dist/app /

CMD ["/app"]
