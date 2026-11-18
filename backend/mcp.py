"""«Подключить ИИ»: the MCP endpoint (Model Context Protocol) that Claude, ChatGPT and
other AI apps call to work with the user's habits and todos.

Only the part of MCP's Streamable HTTP transport a tool server needs, stateless: every
POST carries one JSON-RPC 2.0 message and gets a plain JSON answer (no SSE stream, no
session id). Methods: `initialize`, `ping`, `tools/list`, `tools/call`; notifications
(`notifications/initialized`…) get 202 with no body.

A tool is a typed function (ai_tools.py, ai_admin_tools.py): its arguments are a
pydantic model (the JSON Schema the AI sees is made from it, and the call is validated
by it), its result is a JSON object. Errors the user could fix (a wrong id, a limit)
come back as a tool result with `isError`, so the AI can tell the person; protocol
mistakes are JSON-RPC errors.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ValidationError

from backend.config import Settings
from backend.errors import ApiError
from backend.models import AiConnection, User
from backend.repository import Repository

# Versions of the protocol this server speaks, newest first: the client's own is used
# if known, else the newest.
PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26")
SERVER_INFO = {"name": "knot", "title": "Knot", "version": "1.0.0"}
INSTRUCTIONS = (
    "Knot is the user's habit tracker with one-off todos. Habits have a schedule, daily "
    "check-ins and streaks; todos live in lists and may have a day and a reminder. Start "
    "with get_today or list_habits to learn the ids. Dates are YYYY-MM-DD in the user's "
    "time zone; leave the date out for the user's current day. Ask before changing "
    "many things at once."
)

# JSON-RPC error codes.
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602


@dataclass
class Context:
    """One call: who, through which connection, on which database session."""

    repo: Repository
    user: User
    connection: AiConnection
    settings: Settings
    admin: bool = False


Handler = Callable[[Context, Any], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class Tool:
    name: str
    title: str
    description: str
    arguments: type[BaseModel]
    handler: Handler
    read_only: bool = True
    destructive: bool = False
    admin: bool = False

    def describe(self) -> dict[str, Any]:
        schema = self.arguments.model_json_schema()
        schema.pop("title", None)
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": schema,
            "annotations": {
                "title": self.title,
                "readOnlyHint": self.read_only,
                "destructiveHint": self.destructive,
                "idempotentHint": self.read_only,
                "openWorldHint": False,
            },
        }


@dataclass
class Registry:
    tools: dict[str, Tool] = field(default_factory=dict)

    def add(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def visible(self, ctx: Context) -> list[Tool]:
        return [tool for tool in self.tools.values() if not tool.admin or ctx.admin]


def _error(message_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}}


def _result(message_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": message_id, "result": result}


def tool_text(payload: dict[str, Any], *, error: bool = False) -> dict[str, Any]:
    """A tool result: the JSON as text (every client reads it) and as structured content."""
    result: dict[str, Any] = {
        "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False, default=str)}],
        "isError": error,
    }
    if not error:
        result["structuredContent"] = payload
    return result


async def _call(registry: Registry, ctx: Context, params: dict[str, Any]) -> dict[str, Any]:
    name = params.get("name")
    tool = registry.tools.get(name) if isinstance(name, str) else None
    if tool is None or (tool.admin and not ctx.admin):
        raise _RpcError(INVALID_PARAMS, f"Unknown tool: {name}")
    raw = params.get("arguments") or {}
    try:
        arguments = tool.arguments.model_validate(raw)
    except ValidationError as exc:
        problems = "; ".join(
            f"{'.'.join(str(part) for part in item['loc']) or 'arguments'}: {item['msg']}"
            for item in exc.errors()
        )
        return tool_text({"error": "invalid_arguments", "message": problems}, error=True)
    try:
        return tool_text(await tool.handler(ctx, arguments))
    except ApiError as exc:
        return tool_text({"error": exc.code, "message": exc.message}, error=True)


class _RpcError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


async def handle(registry: Registry, ctx: Context, message: Any) -> dict[str, Any] | None:
    """Answer one JSON-RPC message; None for a notification or a response (no answer)."""
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return _error(None, INVALID_REQUEST, "Expected one JSON-RPC 2.0 message")
    method = message.get("method")
    if "id" not in message or not isinstance(method, str):
        return None  # a notification, or the client answering us: nothing to say
    message_id = message["id"]
    params = message.get("params") or {}
    if not isinstance(params, dict):
        return _error(message_id, INVALID_PARAMS, "params must be an object")
    try:
        if method == "initialize":
            asked = params.get("protocolVersion")
            version = asked if asked in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
            return _result(
                message_id,
                {
                    "protocolVersion": version,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": SERVER_INFO,
                    "instructions": INSTRUCTIONS,
                },
            )
        if method == "ping":
            return _result(message_id, {})
        if method == "tools/list":
            return _result(message_id, {"tools": [tool.describe() for tool in registry.visible(ctx)]})
        if method == "tools/call":
            return _result(message_id, await _call(registry, ctx, params))
        return _error(message_id, METHOD_NOT_FOUND, f"Method not found: {method}")
    except _RpcError as exc:
        return _error(message_id, exc.code, exc.message)
