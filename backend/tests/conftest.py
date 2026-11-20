"""Test-wide setup. ENVIRONMENT is required by settings and must be set before app import."""

import os

os.environ.setdefault("ENVIRONMENT", "test")
