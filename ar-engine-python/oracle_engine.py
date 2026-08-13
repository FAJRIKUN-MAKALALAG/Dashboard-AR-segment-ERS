"""
Internal Python Data Engine (Microservice)
===========================================
Modul 1 - PRD REAL-TIME AR DASHBOARD SYSTEM

Bertugas:
1. Konek ke Oracle DB (AR_SEGMEN_ERS_TBL) via python-oracledb.
2. Cleaning data NULL (numerik -> 0.0, string -> "").
3. Agregasi ringkasan finansial via Pandas.
4. Expose REST API internal: GET /internal/v1/ar-data
"""

from fastapi import FastAPI, HTTPException
import oracledb
import pandas as pd
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Internal Python Oracle Engine", version="1.0.0")

# ---------------------------------------------------------------------------
# Environment Variables (FR-PY-01)
# ---------------------------------------------------------------------------
ORACLE_USER = os.getenv("ORACLE_USER", "db_usr")
ORACLE_PASS = os.getenv("ORACLE_PASS", "db_pwd")
ORACLE_DSN = os.getenv("ORACLE_DSN", "localhost:1521/ORCL")
APP_HOST = os.getenv("APP_HOST", "127.0.0.1")
APP_PORT = int(os.getenv("APP_PORT", "8000"))

# Data Contract: Oracle Column -> JSON Key Standard
COLUMN_MAP = {
    "INVOICE_ID": "invoice_id",
    "AGING_CATEGORY": "aging_category",
    "STATUS_TAGIH": "status_tagih",
    "REGION": "region",
    "INVOICE_STATUS": "invoice_status",
    "NILAI_M": "nilai_m",
    "UIC": "uic",
    "DUE_DATE": "due_date",
    "ACTION_PLAN": "action_plan",
}

STRING_COLUMNS = [
    "invoice_id", "aging_category", "status_tagih", "region",
    "invoice_status", "uic", "due_date", "action_plan",
]


def get_connection():
    """Membuka koneksi Oracle DB (FR-PY-01)."""
    return oracledb.connect(user=ORACLE_USER, password=ORACLE_PASS, dsn=ORACLE_DSN)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "ar-engine-python"}


@app.get("/internal/v1/oracle-health")
def oracle_health():
    """Lightweight connectivity check to verify Oracle integration."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM DUAL")
                result = cursor.fetchone()

        return {
            "status": "success",
            "connected": True,
            "dsn": ORACLE_DSN,
            "result": result[0] if result else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Oracle Health Check Error: {str(e)}")


@app.get("/internal/v1/ar-data")
def get_ar_data():
    """Endpoint internal utama (FR-PY-04)."""
    try:
        conn = get_connection()
        query = """
            SELECT INVOICE_ID, AGING_CATEGORY, STATUS_TAGIH, REGION,
                   INVOICE_STATUS, NILAI_M, UIC, DUE_DATE, ACTION_PLAN
            FROM AR_SEGMEN_ERS_TBL
        """
        df = pd.read_sql(query, con=conn)
        conn.close()

        # Normalisasi Column Name ke JSON Standard
        df = df.rename(columns=COLUMN_MAP)

        # Cleaning Data (FR-PY-02): NULL numerik -> 0.0, NULL string -> ""
        df["nilai_m"] = df["nilai_m"].fillna(0.0).astype(float)
        for col in STRING_COLUMNS:
            if col in df.columns:
                df[col] = df[col].fillna("")

        # Agregasi Financial Summary (FR-PY-03)
        total_ar = float(df["nilai_m"].sum())
        layak = float(df[df["status_tagih"] == "AR LAYAK TAGIH"]["nilai_m"].sum())
        tidak_layak = float(df[df["status_tagih"] == "AR TIDAK LAYAK TAGIH"]["nilai_m"].sum())

        return {
            "status": "success",
            "summary": {
                "total_ar_m": round(total_ar, 2),
                "total_layak_tagih_m": round(layak, 2),
                "total_tidak_layak_m": round(tidak_layak, 2),
                "total_records": len(df),
            },
            "data": df.to_dict(orient="records"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Oracle Engine Error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=APP_HOST, port=APP_PORT)
