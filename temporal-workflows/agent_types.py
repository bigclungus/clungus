"""
Shared types for the AgentTask tracking system.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

AgentType = Literal["claude", "gemini", "gpt", "custom"]


@dataclass
class AgentTaskInput:
    task_id: str
    prompt: str
    agent_type: AgentType = "claude"
    model: str = "claude-sonnet-4-6"
    api_key: str | None = None
    extra_cli_args: list[str] = field(default_factory=list)
    is_foreground: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)
    started_at: datetime | None = None
