from fastapi import FastAPI, Request

from database import get_db, write_audit


def register_audit_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def audit_middleware(request: Request, call_next):
        """Enregistre chaque requête avec contexte utilisateur optionnel (en-têtes)."""
        uid = request.headers.get("x-medibot-user-id") or request.headers.get("X-Medibot-User-Id")
        uname = request.headers.get("x-medibot-user-name") or request.headers.get("X-Medibot-User-Name")
        urole = request.headers.get("x-medibot-user-role") or request.headers.get("X-Medibot-User-Role")
        if request.client:
            ip = request.client.host
        else:
            ip = ""
        path = request.url.path
        skip = path in ("/docs", "/openapi.json", "/redoc", "/favicon.ico") or path.startswith("/static")
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            raise
