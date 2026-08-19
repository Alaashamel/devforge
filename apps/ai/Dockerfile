# syntax=docker/dockerfile:1
# DevForge AI service — Python/FastAPI (uvicorn).
# Build from the repository root: docker build -f apps/ai/Dockerfile .
FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY apps/ai/pyproject.toml apps/ai/README.md ./
COPY apps/ai/app ./app
RUN pip install --no-cache-dir . && \
    useradd --create-home --uid 1001 ai
USER 1001
EXPOSE 5001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5001", "--app-dir", "/app"]
