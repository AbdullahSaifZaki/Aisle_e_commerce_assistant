"""ASGI entrypoint for Vercel and Uvicorn (run from the repository root)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend"))
from main import app
