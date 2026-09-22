#!/bin/bash
set -e

# BUILD_MODE controls how user-data is built at container startup:
#   auto           (default) fetch/extract only when extracted game data is missing
#   force-download always fetch user-data from the latest GitHub release,
#                  replacing the data already in /app/user-data
BUILD_MODE="${BUILD_MODE:-auto}"

case "$BUILD_MODE" in
    auto) ;;
    force-download|force_download) BUILD_MODE="force-download" ;;
    *)
        echo "Error: unsupported BUILD_MODE '$BUILD_MODE' (expected 'auto' or 'force-download')." >&2
        exit 1
        ;;
esac

data_missing() {
    [ ! -d "/app/user-data/extracted-gamedata/game_data" ] || \
        [ -z "$(ls -A /app/user-data/extracted-gamedata/game_data 2>/dev/null)" ]
}

if [ "$BUILD_MODE" = "force-download" ]; then
    echo "BUILD_MODE=force-download: fetching user-data from GitHub releases, replacing existing data..."
    if [ -f "/app/scripts/download_user_data.py" ]; then
        python /app/scripts/download_user_data.py --target-dir /app/user-data --force || \
            echo "Warning: forced user-data download failed; keeping the existing data." >&2
    else
        echo "Warning: download_user_data.py not found; cannot force-download user-data." >&2
    fi
elif data_missing; then
    echo "Extracted game data not found in user-data."

    # First attempt: fetch pre-extracted assets from GitHub releases
    if [ -f "/app/scripts/download_user_data.py" ]; then
        echo "Attempting to fetch user-data from GitHub releases..."
        python /app/scripts/download_user_data.py --target-dir /app/user-data || true
    fi

    # Second attempt: fallback to local extraction from local-input if available
    if data_missing; then
        if [ -f "/app/scripts/extract_everything.py" ]; then
            echo "Running local extract_everything.py to generate assets..."
            python /app/scripts/extract_everything.py
        else
            echo "Warning: extract_everything.py not found and user-data download was not completed."
        fi
    fi
else
    echo "Extracted game data found, skipping download/extraction."
fi

# Execute the CMD from the Dockerfile
exec "$@"
