import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse


def _stringify_details(error: Exception) -> str:
    return ''.join(
        traceback.format_exception(type(error), error, error.__traceback__)
    ).strip()


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def handle_http_error(request: Request, error: HTTPException):
        request_id = request.headers.get('x-request-id')

        return JSONResponse(
            status_code=error.status_code,
            content={
                "error": str(error.detail) or "HTTP error",
                "details": None,
                "requestId": request_id,
                "source": "tts-server",
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, error: Exception):
        request_id = request.headers.get('x-request-id')
        stack_trace = _stringify_details(error)

        print(
            {
                "module": "tts-server",
                "event": "unhandled-error",
                "path": request.url.path,
                "method": request.method,
                "requestId": request_id,
                "error": str(error),
                "details": stack_trace,
            }
        )

        return JSONResponse(
            status_code=500,
            content={
                "error": str(error) or "Unexpected TTS server error",
                "details": stack_trace,
                "requestId": request_id,
                "source": "tts-server",
            },
        )
