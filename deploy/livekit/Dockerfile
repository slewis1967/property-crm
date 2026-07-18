# Bakes the CRM's LiveKit config into the official server image so Fly can run
# it without a volume mount. Rebuild + `fly deploy` whenever livekit.yaml
# changes. Secrets (LIVEKIT_KEYS, LIVEKIT_WEBHOOK_API_KEY) are injected at
# runtime via `fly secrets`, never baked in.
FROM livekit/livekit-server:latest

COPY livekit.yaml /etc/livekit.yaml

# LIVEKIT_CONFIG (set in fly.toml [env]) tells the server where to read config.
CMD ["--config", "/etc/livekit.yaml"]
