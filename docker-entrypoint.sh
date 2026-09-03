#!/bin/bash
set -e

# Check if the extracted data already exists
if [ ! -d "/app/user-data/extracted-gamedata/game_data" ] || [ -z "$(ls -A /app/user-data/extracted-gamedata/game_data 2>/dev/null)" ]; then
    echo "Extracted game data not found in user-data."
    
    # First attempt: fetch pre-extracted assets from GitHub releases
    if [ -f "/app/scripts/download_user_data.py" ]; then
        echo "Attempting to fetch user-data from GitHub releases..."
        python /app/scripts/download_user_data.py --target-dir /app/user-data || true
    fi

    # Second attempt: fallback to local extraction from local-input if available
    if [ ! -d "/app/user-data/extracted-gamedata/game_data" ] || [ -z "$(ls -A /app/user-data/extracted-gamedata/game_data 2>/dev/null)" ]; then
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
