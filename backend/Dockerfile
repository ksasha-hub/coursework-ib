FROM rust:alpine as builder
RUN apk add --no-cache g++ make musl-dev pkgconfig openssl-dev
WORKDIR /usr/src/project
COPY crypto-lib ./crypto-lib
COPY backend ./backend
WORKDIR /usr/src/project/backend
RUN cargo build --release

FROM alpine:latest
RUN apk add --no-cache libgcc libstdc++
WORKDIR /app
COPY --from=builder /usr/src/project/backend/target/release/ib_backend .
CMD ["./ib_backend"]
