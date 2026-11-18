# Innovation Portal Deployment

This project deploys as an isolated Docker Compose stack with project-specific names:

- Compose project: `innovation_portal`
- Network: `innovation_portal_net`
- Containers:
  - `innovation_portal_edge`
  - `innovation_portal_backend`
  - `innovation_portal_db`
  - `innovation_portal_redis`
- Volumes:
  - `innovation_portal_postgres_data`
  - `innovation_portal_redis_data`
  - `innovation_portal_static_data`
  - `innovation_portal_media_data`

## Configuration

Runtime configuration lives in `.env.production`.

Committed template:

- `.env.production.example`

Live file used on this server:

- `.env.production`

## Deploy

```sh
docker compose --env-file .env.production up -d --build
```

## Restart

```sh
docker compose --env-file .env.production restart
```

## Stop

```sh
docker compose --env-file .env.production down
```

## Status

```sh
docker compose --env-file .env.production ps
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

## Logs

```sh
docker compose --env-file .env.production logs -f innovation_portal_backend
docker compose --env-file .env.production logs -f innovation_portal_edge
```

## Health Checks

```sh
curl http://127.0.0.1:18180/health/
curl http://127.0.0.1:18181/health/
curl http://127.0.0.1:18182/health/
```

## URLs

- Public frontend: `http://10.6.1.241:18180/`
- Staff frontend: `http://10.6.1.241:18181/`
- Backend API: `http://10.6.1.241:18182/api/`
- Swagger docs: `http://10.6.1.241:18182/api/docs/swagger/`
- Django admin login: `http://10.6.1.241:18181/admin/login/`
