import re

from fastapi import HTTPException


def validate_id(id_str: str) -> str:
    """Validate that an ID contains only safe characters (alphanumeric, dash, underscore)."""
    if not re.match(r'^[a-zA-Z0-9_-]+$', id_str):
        raise HTTPException(status_code=400, detail="Invalid ID format")
    return id_str
