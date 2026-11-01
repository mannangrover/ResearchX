# Builds the frontend, then serves it and the API as one web service.
FROM node:24-slim AS frontend
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    REQUIRE_AUTH=true \
    STATIC_DIR=/app/static \
    EMBEDDING_BACKEND=gemini \
    DAILY_LIMIT_PER_USER=30 \
    DAILY_LIMIT_TOTAL=300
WORKDIR /app
COPY backend/requirements.txt backend/constraints.txt ./
RUN pip install --no-cache-dir -r requirements.txt -c constraints.txt
COPY backend/app ./app
COPY --from=frontend /web/dist ./static
RUN useradd --create-home --uid 1000 researchx && chown -R researchx /app
USER researchx
# One process: the daily limits are counted in memory
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"]
