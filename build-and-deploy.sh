#!/bin/bash
# Build and deploy gym dashboard to GitHub Pages
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🏋️ Generating data from gym.db..."
/usr/bin/python3 generate.py

echo "📦 Committing and pushing..."
git add -A
git commit -m "Update dashboard data $(date '+%Y-%m-%d %H:%M')" --allow-empty
git push origin main

echo "✅ Done! Site will update at: https://arnauvgilotra.github.io/gym-dashboard/"
