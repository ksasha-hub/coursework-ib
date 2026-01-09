FROM rust:latest as builder
RUN apt-get update && apt-get install -y g++
WORKDIR /usr/src/project

COPY crypto-lib ./crypto-lib
COPY backend ./backend

WORKDIR /usr/src/project/backend
# Показываем структуру для отладки, если вдруг что
RUN ls -R src/
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /usr/src/project/backend/target/release/ib_backend .
CMD ["./ib_backend"]
