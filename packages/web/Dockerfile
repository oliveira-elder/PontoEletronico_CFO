FROM node:20-alpine

WORKDIR /app

# Dependencias e codigo vem do volume do monorepo em desenvolvimento.
EXPOSE 11010

CMD ["sh", "-c", "npm install && npm run dev -w @intranet/web -- --host 0.0.0.0 --port 11010"]
