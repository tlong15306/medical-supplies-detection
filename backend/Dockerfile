# syntax=docker/dockerfile:1
FROM golang:1.26.5-bookworm@sha256:0d327c83532d3cdeeeebab56ce85962bf09cb89545355b10207c7771b0c3713f AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -mod=readonly -trimpath -o /out/api ./cmd/api

FROM alpine:3.22.2@sha256:85f2b723e106c34644cd5851d7e81ee87da98ac54672b29947c052a45d31dc2f
WORKDIR /app
COPY --from=build /out/api /app/api
ENV GIN_MODE=release SERVER_ADDRESS=:8080
USER 10001:10001
EXPOSE 8080
CMD ["/app/api"]
