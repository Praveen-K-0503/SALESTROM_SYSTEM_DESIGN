"""
SALESTORM — Diagram Asset Generator
Fetches high-resolution PNGs and Vector SVGs for all 13 system design diagrams
and packages them into SALESTORM_TEAM_NAME/diagrams/ and a downloadable ZIP.
"""
import base64
import json
import os
import time
import urllib.request
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR
TEAM_DIR = PROJECT_ROOT / "SALESTROM_MD_MMD"
OUTPUT_DIR = TEAM_DIR / "diagrams"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

DIAGRAMS = [
    # HLD
    ("01_system_context", TEAM_DIR / "02_HLD" / "01_context.mmd", "System Context Diagram (C4 Level 1)"),
    ("02_container_architecture", TEAM_DIR / "02_HLD" / "02_container.mmd", "Container & Service Architecture (C4 Level 2)"),
    ("03_component_diagram", TEAM_DIR / "02_HLD" / "03_component.mmd", "Critical Component Architecture (C4 Level 3)"),
    ("04_deployment_infrastructure", TEAM_DIR / "02_HLD" / "04_deployment.mmd", "Production AWS Multi-AZ Deployment Diagram"),
    
    # Database
    ("05_database_er_diagram", TEAM_DIR / "04_Database" / "er_diagram.mmd", "Entity-Relationship (ER) Schema Diagram"),
    
    # LLD Classes
    ("06_class_inventory", TEAM_DIR / "03_LLD" / "01_class_inventory.mmd", "Inventory Domain Class Diagram"),
    ("07_class_payment", TEAM_DIR / "03_LLD" / "02_class_payment.mmd", "Payment Service & Circuit Breaker Class Diagram"),
    ("08_class_order", TEAM_DIR / "03_LLD" / "03_class_order.mmd", "Order Service & Saga Domain Class Diagram"),
    
    # LLD Sequences
    ("09_sequence_reservation", TEAM_DIR / "03_LLD" / "04_seq_reservation.mmd", "Two-Phase Inventory Reservation Sequence Diagram"),
    ("10_sequence_payment", TEAM_DIR / "03_LLD" / "05_seq_payment.mmd", "Idempotent Payment & Reconciliation Sequence Diagram"),
    ("11_sequence_order_recovery", TEAM_DIR / "03_LLD" / "06_seq_order_recovery.mmd", "30-Second Order Service Outage Recovery Sequence Diagram"),
    
    # LLD State Machines
    ("12_state_reservation", TEAM_DIR / "03_LLD" / "07_state_reservation.mmd", "10-Minute Hold Reservation State Machine"),
    ("13_state_order", TEAM_DIR / "03_LLD" / "08_state_order.mmd", "Order Fulfillment & Delivery State Machine"),
]

def fetch_asset(code: str, file_type: str, output_path: Path):
    # Professional neutral/default theme with high contrast
    payload = json.dumps({"code": code, "mermaid": {"theme": "default"}})
    b64 = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("utf-8")
    
    if file_type == "svg":
        url = f"https://mermaid.ink/svg/{b64}"
    else:
        url = f"https://mermaid.ink/img/{b64}?type=png"
        
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        content = resp.read()
        output_path.write_bytes(content)

def main():
    print("=" * 60)
    print("SALESTORM — Generating Real Downloadable Architecture Diagrams")
    print("=" * 60)
    
    generated_files = []
    
    for filename, source_path, title in DIAGRAMS:
        if not source_path.exists():
            print(f"Skipping {filename}: {source_path} does not exist.")
            continue
            
        code = source_path.read_text(encoding="utf-8")
        svg_path = OUTPUT_DIR / f"{filename}.svg"
        png_path = OUTPUT_DIR / f"{filename}.png"
        
        print(f"\n[Processing] {title}...")
        
        # 1. Fetch SVG
        try:
            fetch_asset(code, "svg", svg_path)
            size_kb = svg_path.stat().st_size / 1024
            print(f"  [OK] SVG generated: {svg_path.name} ({size_kb:.1f} KB)")
            generated_files.append(svg_path)
        except Exception as e:
            print(f"  [FAIL] Failed SVG for {filename}: {e}")
            
        time.sleep(0.5)
        
        # 2. Fetch PNG
        try:
            fetch_asset(code, "png", png_path)
            size_kb = png_path.stat().st_size / 1024
            print(f"  [OK] PNG generated: {png_path.name} ({size_kb:.1f} KB)")
            generated_files.append(png_path)
        except Exception as e:
            print(f"  [FAIL] Failed PNG for {filename}: {e}")
            
        time.sleep(0.5)

    # 3. Create a unified ZIP file
    zip_path = OUTPUT_DIR / "SALESTORM_Architecture_Diagrams.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for f in generated_files:
            zipf.write(f, arcname=f.name)
            
    print("\n" + "=" * 60)
    print(f"All {len(generated_files)} diagram assets generated successfully!")
    print(f"Downloadable ZIP Archive created at:\n{zip_path}")
    print("=" * 60)

if __name__ == "__main__":
    main()
