# 💪 Gym Dashboard

Auto-generated workout progress dashboard. Dark mode, mobile-first, wins-first.

**Live:** [arnauvgilotra.github.io/gym-dashboard](https://arnauvgilotra.github.io/gym-dashboard/)

## How it works

1. `generate.py` reads `gym.db` (SQLite) and generates static JSON
2. `docs/` contains the static site (HTML/CSS/JS + Chart.js)
3. GitHub Actions deploys `docs/` to GitHub Pages on push

## Update

```bash
./build-and-deploy.sh
```

Or run `generate.py` manually and push.
