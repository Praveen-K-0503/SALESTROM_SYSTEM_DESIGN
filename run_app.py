"""
SALESTORM — Quick Launch Script
Runs the FastAPI Backend & Light Theme Web Application on http://127.0.0.1:8000
"""
import os
import sys

# Ensure SALESTROM_MD_MMD is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "SALESTROM_MD_MMD"))

import uvicorn

if __name__ == "__main__":
    print("=" * 60)
    print("SALESTORM Flash Sale Platform — Web Application Starting")
    print("URL: http://127.0.0.1:8000")
    print("=" * 60)
    uvicorn.run("web_app.server:app", host="127.0.0.1", port=8000, reload=False)
