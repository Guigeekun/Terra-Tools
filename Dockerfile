# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the FastAPI backend
FROM python:3.11-slim
WORKDIR /app

# Copy backend requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all python code and directories
COPY . .

# Overwrite the empty/unbuilt frontend/dist with the built one from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Ensure the empty directories exist in case they aren't mounted
RUN mkdir -p /app/user-data /app/local-input /app/scripts

# Fetch pre-extracted user-data from GitHub releases if missing.
# Optionally pass a GitHub token to raise the api.github.com rate limit:
#   docker build --secret id=github_token,env=GITHUB_TOKEN .
# Without it the fetch falls back to the API-less release download URLs.
ARG FETCH_USER_DATA=true
RUN --mount=type=secret,id=github_token,target=/run/secrets/github_token \
    if [ "$FETCH_USER_DATA" = "true" ]; then \
        GITHUB_TOKEN="$(cat /run/secrets/github_token 2>/dev/null || true)" \
        python /app/scripts/download_user_data.py --target-dir /app/user-data ; \
    fi

# Copy entrypoint script and make it executable.
# At runtime the entrypoint honors BUILD_MODE: "auto" (default) fetches
# user-data only when missing, "force-download" re-fetches it from the
# latest release to replace existing data (see docker-entrypoint.sh).
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Expose the port the app runs on
EXPOSE 5001

# Set the entrypoint to our startup script
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# Run uvicorn directly to bypass the browser auto-open in app.py
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001"]
