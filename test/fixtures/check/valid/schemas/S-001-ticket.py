# GENERATED FROM S-001-ticket.schema.json BY ITE 0.1.0 - DO NOT EDIT. Re-run compile.
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field


class Ticket(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: Annotated[str, Field(max_length=120)]
    priority: Literal["low", "high"]
