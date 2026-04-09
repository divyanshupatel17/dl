Self-Healing Monocular Digital Twin System for Autonomous Vehicles

## Frontend + Backend Deployment

The frontend can be hosted on GitHub Pages. The backend (FastAPI websocket + OpenCV/YOLO) must be hosted separately because GitHub Pages is static only.

### Why production shows WS disconnected

If the site is live but websocket shows disconnected, it means frontend is reachable but backend websocket endpoint is not reachable from that browser URL.

### Runtime backend URL setup (no rebuild)

Open your deployed URL once with query parameter:

- `https://yourdomain/dl/?ws=wss://your-backend-domain/ws/pipeline`

The app stores it in browser localStorage and uses it on future loads.

To clear it:

- `localStorage.removeItem('pipelineWsUrl')`

### Same domain for both frontend and backend

Yes, but only with reverse proxy infrastructure. One example:

- `https://yourdomain/dl/` -> GitHub Pages frontend
- `wss://yourdomain/ws/pipeline` -> backend service

Without this proxy, GitHub Pages cannot run the Python backend itself.

## Render vs Railway (best for this project)

For this stack (FastAPI websocket + OpenCV + YOLO):

- Best for easiest setup and zero-cost demo: **Render** (free tier available, but can sleep when idle)
- Best for always-on smoother realtime: **Railway** (usually paid, but less cold-start pain)

If you want quickest path now, use **Render** first.

## Simple Backend Setup (Render)

This repo already includes `render.yaml`, so setup is mostly click-through:

1. Open Render dashboard -> New -> Blueprint
2. Connect your GitHub repo
3. Select this repo root (`base`) and deploy
4. Render reads `render.yaml` and creates `digital-twin-backend`
5. After deploy, open `<your-render-url>/health` and verify `{ "ok": true, ... }`
6. Open frontend once with:
	`https://divyanshupatel.com/dl/?ws=wss://<your-render-url>/ws/pipeline`

Note: Render free web services can sleep when idle. First request may take time.

## Simple Backend Setup (Railway)

This repo includes `railway.toml` and `nixpacks.toml`.

1. New Project -> Deploy from GitHub repo
2. Railway auto-builds using Nixpacks
3. Start command uses uvicorn from `railway.toml`
4. Verify `<your-railway-url>/health`
5. Open frontend once with:
	`https://divyanshupatel.com/dl/?ws=wss://<your-railway-url>/ws/pipeline`