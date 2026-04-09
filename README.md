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