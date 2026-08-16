"""
Internal Python Data Engine (Microservice) v2.0
================================================
Sesuai reports.md:
- Filter: ?month=, ?segment=, ?region=
- Endpoint baru: /ar-months, /ar-segments
- Payload lengkap: segment_breakdown, ar_flow, action_plan, detail data
"""

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import oracledb
import pandas as pd
import os
from dotenv import load_dotenv
from typing import Dict, Any, Optional
from sqlalchemy import create_engine

load_dotenv()

app = FastAPI(title="Internal Python Oracle Engine", version="2.0.0")

# Allow CORS from React dev server and Laravel gateway
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ORACLE_USER = os.getenv("ORACLE_USER", "system")
ORACLE_PASS = os.getenv("ORACLE_PASS", "sys")
ORACLE_DSN  = os.getenv("ORACLE_DSN",  "localhost:1521/XE")
APP_HOST    = os.getenv("APP_HOST",    "127.0.0.1")
APP_PORT    = int(os.getenv("APP_PORT", "8000"))

_dsn_parts = ORACLE_DSN.split("/")
_service   = _dsn_parts[1] if len(_dsn_parts) > 1 else "XE"
_hostport  = _dsn_parts[0].split(":")
_host      = _hostport[0]
_port      = int(_hostport[1]) if len(_hostport) > 1 else 1521

engine = create_engine(
    "oracle+oracledb://",
    connect_args={
        "user": ORACLE_USER, "password": ORACLE_PASS,
        "host": _host, "port": _port, "service_name": _service,
    },
)

def get_connection():
    return engine.connect()

def get_raw_connection():
    return oracledb.connect(user=ORACLE_USER, password=ORACLE_PASS, dsn=ORACLE_DSN)

TABLE_PKEYS = {
    "AR_SEGMEN_ERS_TBL":           "invoice_id",
    "AR_CASH_INFLOW_FORECAST_TBL": "month_label",
    "AR_TREND_T13M_TBL":           "month_label",
    "AR_METRICS_HISTORY_TBL":      "month_label",
    "AR_TOP_CUSTOMERS_TBL":        "customer_name"
}

@app.get("/")
def health_check():
    return {"status": "ok", "service": "ar-engine-python", "version": "2.0.0"}

# ── /ar-months ──────────────────────────────────────────────────────
@app.get("/internal/v1/ar-months")
def get_ar_months():
    """Distinct REPORT_MONTH values in the DB."""
    try:
        conn = get_connection()
        try:
            df = pd.read_sql(
                "SELECT DISTINCT REPORT_MONTH FROM AR_SEGMEN_ERS_TBL "
                "WHERE REPORT_MONTH IS NOT NULL ORDER BY REPORT_MONTH DESC",
                con=conn
            )
            df.columns = [c.lower() for c in df.columns]
            months = df["report_month"].tolist()
        except Exception:
            months = []
        conn.close()
        return {"status": "success", "months": months}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── /ar-segments ─────────────────────────────────────────────────────
@app.get("/internal/v1/ar-segments")
def get_ar_segments():
    """Distinct PENGELOLAAN (segment) values in the DB."""
    try:
        conn = get_connection()
        try:
            df = pd.read_sql(
                "SELECT DISTINCT PENGELOLAAN FROM AR_SEGMEN_ERS_TBL "
                "WHERE PENGELOLAAN IS NOT NULL ORDER BY PENGELOLAAN",
                con=conn
            )
            df.columns = [c.lower() for c in df.columns]
            segments = df["pengelolaan"].tolist()
        except Exception:
            segments = ["SBS", "MIS", "TWS", "FRBS", "ERS"]
        conn.close()
        return {"status": "success", "segments": segments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── /ar-data ─────────────────────────────────────────────────────────
@app.get("/internal/v1/ar-data")
def get_ar_data(
    month:   Optional[str] = None,
    segment: Optional[str] = None,
    region:  Optional[str] = None,
):
    try:
        conn = get_connection()

        # Build WHERE clause
        conditions = []
        params = {}
        if month   and month   != "ALL":
            conditions.append("REPORT_MONTH = :month");   params["month"]   = month
        if segment and segment != "ALL":
            conditions.append("PENGELOLAAN = :segment");  params["segment"] = segment
        if region  and region  != "ALL":
            conditions.append("REGION = :region");        params["region"]  = region

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        df_inv = pd.read_sql(f"SELECT * FROM AR_SEGMEN_ERS_TBL {where}", con=conn, params=params)
        df_inv.columns = [c.lower() for c in df_inv.columns]

        df_inflow = pd.read_sql("SELECT * FROM AR_CASH_INFLOW_FORECAST_TBL ORDER BY SORT_ORDER", con=conn)
        df_inflow.columns = [c.lower() for c in df_inflow.columns]

        df_trend = pd.read_sql("SELECT * FROM AR_TREND_T13M_TBL ORDER BY SORT_ORDER", con=conn)
        df_trend.columns = [c.lower() for c in df_trend.columns]

        df_metrics = pd.read_sql("SELECT * FROM AR_METRICS_HISTORY_TBL ORDER BY SORT_ORDER", con=conn)
        df_metrics.columns = [c.lower() for c in df_metrics.columns]

        cust_where = where.replace("REPORT_MONTH", "REPORT_MONTH").replace("PENGELOLAAN", "CUSTOMER_NAME LIKE '%'--").replace("REGION", "CUSTOMER_NAME LIKE '%'--")
        # Simpler: rebuild for customers (they only have REPORT_MONTH)
        cust_conditions = []
        if month and month != "ALL":
            cust_conditions.append("REPORT_MONTH = :month")
        cust_where_str = ("WHERE " + " AND ".join(cust_conditions)) if cust_conditions else ""
        cust_params = {"month": month} if (month and month != "ALL") else {}

        df_cust = pd.read_sql(
            f"SELECT * FROM AR_TOP_CUSTOMERS_TBL {cust_where_str} ORDER BY OVER_DUE DESC FETCH FIRST 20 ROWS ONLY",
            con=conn, params=cust_params
        )
        df_cust.columns = [c.lower() for c in df_cust.columns]

        conn.close()

        # ── KPI ────────────────────────────────────────────
        def s(col, filt=None):
            if df_inv.empty: return 0.0
            d = df_inv[df_inv[col] == filt] if filt else df_inv
            return float(d["nilai_m"].sum())

        total_balance = s(None)
        layak         = s("status_tagih", "AR LAYAK TAGIH")
        tidak_layak   = s("status_tagih", "AR TIDAK LAYAK TAGIH")
        bermasalah    = s("status_tagih", "AR BERMASALAH")
        over_due      = tidak_layak + bermasalah

        as_of_date = month if month and month != "ALL" else (
            df_inv["report_month"].iloc[0]
            if not df_inv.empty and "report_month" in df_inv.columns
            else "Agustus 2026"
        )

        # ── Segment Breakdown (FR-02) ────────────────────────
        segment_breakdown = {}
        if not df_inv.empty and "pengelolaan" in df_inv.columns:
            for seg, grp in df_inv.groupby("pengelolaan"):
                segment_breakdown[str(seg)] = round(float(grp["nilai_m"].sum()), 4)

        largest_segment = max(segment_breakdown, key=segment_breakdown.get) if segment_breakdown else "-"

        # ── Age Analysis ────────────────────────────────────
        def ag(cat): return round(float(df_inv[df_inv["aging_category"] == cat]["nilai_m"].sum()), 4) if not df_inv.empty else 0.0
        age_analysis = {
            "AR Layak Tagih":       round(layak, 4),
            "AR Bermasalah":        round(bermasalah, 4),
            "AR Tidak Layak Tagih": round(tidak_layak, 4),
            "Within Due":           ag("Within Due"),
            "Over Due 0-30 Days":   ag("0-30 Days"),
            "Over Due 31-60 Days":  ag("31-60 Days"),
            "Over Due 61-90 Days":  ag("61-90 Days"),
            "Due Over 90 Days":     ag(">90 Days"),
        }

        # ── AR Flow (FR-04 / FR-05) ──────────────────────────
        # Layer 1: Tidak Layak vs Layak
        # Layer 2 (Layak): Jakarta vs Regional
        # Layer 3 (Jakarta): Sudah Invoice vs Belum Invoice
        # Layer 4: per category
        ar_flow = {
            "total_m": round(total_balance, 4),
            "tidak_layak_m": round(tidak_layak, 4),
            "layak_tagih_m": round(layak, 4),
            "bermasalah_m": round(bermasalah, 4),
            "regional": {"total_m": 0.0},
            "jakarta": {
                "total_m": 0.0,
                "sudah_invoice_m": 0.0,
                "belum_invoice_m": 0.0,
                "categories": {}
            }
        }

        if not df_inv.empty:
            df_layak = df_inv[df_inv["status_tagih"] != "AR TIDAK LAYAK TAGIH"]
            if not df_layak.empty:
                # Jakarta = AREA == 'Jakarta' (case-insensitive)
                df_jkt = df_layak[df_layak["region"].str.lower().str.strip() == "jakarta"]
                df_reg = df_layak[df_layak["region"].str.lower().str.strip() != "jakarta"]

                ar_flow["jakarta"]["total_m"]        = round(float(df_jkt["nilai_m"].sum()), 4)
                ar_flow["regional"]["total_m"]       = round(float(df_reg["nilai_m"].sum()), 4)

                SUDAH_CATS = ["SUDAH INVOICE"]
                BELUM_CATS = ["KONTRAK", "BAST/BAPP", "REKON/SLG", "TERMYN", "PROSES IDENTIFIKASI", "KOREKSI", "CHECKER"]

                sudah_val = float(df_jkt[df_jkt["invoice_status"].isin(SUDAH_CATS)]["nilai_m"].sum())
                belum_val = float(df_jkt[df_jkt["invoice_status"].isin(BELUM_CATS)]["nilai_m"].sum())
                ar_flow["jakarta"]["sudah_invoice_m"] = round(sudah_val, 4)
                ar_flow["jakarta"]["belum_invoice_m"] = round(belum_val, 4)

                for cat in SUDAH_CATS + BELUM_CATS:
                    v = float(df_jkt[df_jkt["invoice_status"] == cat]["nilai_m"].sum())
                    if v > 0:
                        ar_flow["jakarta"]["categories"][cat] = round(v, 4)

                # Regional by region name
                if not df_reg.empty:
                    rgrp = df_reg.groupby("region")["nilai_m"].sum()
                    ar_flow["regional"]["breakdown"] = {
                        r: round(float(v), 4) for r, v in rgrp.items() if v > 0
                    }

        # ── Action Plan Table (FR-08 / FR-09) ────────────────
        action_plan_rows = []
        category_uic_map = {
            "AR TIDAK LAYAK TAGIH": ("SEGMEN",            "Dorong DO/Adjustment Negatif",        "Q4"),
            "REGIONAL":             ("CGA, SEGMEN & REGIONAL", "Monthly rekonsiliasi forum collection", "MONTHLY"),
            "SUDAH INVOICE":        ("CGA & PELANGGAN",   "Proses Bayar / Reminding",            "JUNI 2026"),
            "KONTRAK":              ("SEGMEN, LEGAL & PELANGGAN", "Percepatan penyelesaian kontrak", "Q3"),
            "BAST/BAPP":            ("CCA, SEGMEN, PELANGGAN", "Proses BAST/BAPP",               "Q3"),
            "REKON/SLG":            ("Segmen, Pelanggan & CGA", "Rekonsiliasi SLG",               "Q3"),
            "TERMYN":               ("Segmen, CCA",       "Proses Termin",                       "Q3"),
            "PROSES IDENTIFIKASI":  ("CCA & SEGMEN",      "Identifikasi & validasi tagihan",     "JUNI 2026"),
        }

        for cat, (uic, action, due) in category_uic_map.items():
            if cat == "AR TIDAK LAYAK TAGIH":
                v = tidak_layak
            elif cat == "REGIONAL":
                v = ar_flow["regional"]["total_m"]
            else:
                v = ar_flow["jakarta"]["categories"].get(cat, 0.0)
            if v > 0:
                action_plan_rows.append({
                    "kategori": cat,
                    "nilai_m": round(v, 4),
                    "uic": uic,
                    "tindak_lanjut": action,
                    "due_date": due
                })

        # ── Category Breakdown ───────────────────────────────
        category_breakdown = {}
        if not df_inv.empty:
            for cat, val in df_inv.groupby("invoice_status")["nilai_m"].sum().items():
                category_breakdown[str(cat)] = round(float(val), 4)

        # ── Region Breakup ────────────────────────────────────
        region_breakup = []
        if not df_inv.empty:
            rgrp = df_inv.groupby("region")["nilai_m"].sum().reset_index()
            rtot = rgrp["nilai_m"].sum()
            for _, row in rgrp.iterrows():
                rv = float(row["nilai_m"])
                if rv > 0:
                    region_breakup.append({
                        "region": row["region"],
                        "value": round(rv, 4),
                        "percentage": round(rv / rtot * 100, 2) if rtot else 0.0
                    })

        # ── Historical Trend (multi-month comparison) ─────────
        history_trend = {}
        if not df_inv.empty and "report_month" in df_inv.columns:
            for month_val, grp in df_inv.groupby("report_month"):
                history_trend[str(month_val)] = {
                    "total_m": round(float(grp["nilai_m"].sum()), 4),
                    "layak_m": round(float(grp[grp["status_tagih"] == "AR LAYAK TAGIH"]["nilai_m"].sum()), 4),
                    "tidak_layak_m": round(float(grp[grp["status_tagih"] == "AR TIDAK LAYAK TAGIH"]["nilai_m"].sum()), 4),
                    "bermasalah_m":  round(float(grp[grp["status_tagih"] == "AR BERMASALAH"]["nilai_m"].sum()), 4),
                }

        return {
            "status": "success",
            "summary": {
                "total_ar_m":          round(total_balance, 4),
                "total_layak_tagih_m": round(layak, 4),
                "total_tidak_layak_m": round(tidak_layak, 4),
                "total_bermasalah_m":  round(bermasalah, 4),
                "over_due_m":          round(over_due, 4),
                "overdue_pct":         round(over_due / total_balance * 100, 2) if total_balance > 0 else 0.0,
                "largest_segment":     largest_segment,
                "dso":                 60,
                "as_of_date":          as_of_date,
                "total_records":       len(df_inv),
                "active_filters": {
                    "month": month or "ALL",
                    "segment": segment or "ALL",
                    "region": region or "ALL",
                }
            },
            "charts": {
                "age_analysis":       age_analysis,
                "segment_breakdown":  segment_breakdown,
                "category_breakdown": category_breakdown,
                "region_breakup":     region_breakup,
                "ar_flow":            ar_flow,
                "history_trend":      history_trend,
                "cash_inflow":        df_inflow.to_dict(orient="records"),
                "trend_t13m":         df_trend.to_dict(orient="records"),
                "sparkline_overdue_pct": df_metrics["overdue_pct"].tolist() if not df_metrics.empty else [],
                "sparkline_dso":         df_metrics["dso"].tolist()         if not df_metrics.empty else [],
                "sparkline_months":      df_metrics["month_label"].tolist() if not df_metrics.empty else [],
            },
            "action_plan":   action_plan_rows,
            "top_customers": df_cust.to_dict(orient="records"),
            "data":          df_inv.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Oracle Engine Error: {str(e)}")

# ── CRUD ─────────────────────────────────────────────────────────────
@app.get("/internal/v1/tables/{table_name}")
def get_table_data(table_name: str):
    if table_name not in TABLE_PKEYS:
        raise HTTPException(status_code=400, detail="Invalid table name")
    try:
        conn = get_connection()
        df = pd.read_sql(f"SELECT * FROM {table_name}", con=conn)
        df.columns = [c.lower() for c in df.columns]
        conn.close()
        return {"status": "success", "primary_key": TABLE_PKEYS[table_name], "data": df.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/internal/v1/tables/{table_name}")
def create_row(table_name: str, payload: Dict[str, Any] = Body(...)):
    if table_name not in TABLE_PKEYS:
        raise HTTPException(status_code=400, detail="Invalid table name")
    try:
        p = {k.upper(): v for k, v in payload.items()}
        sql = f"INSERT INTO {table_name} ({', '.join(p.keys())}) VALUES ({', '.join([f':{i+1}' for i in range(len(p))])})"
        conn = get_raw_connection(); cur = conn.cursor()
        cur.execute(sql, list(p.values())); conn.commit(); cur.close(); conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/internal/v1/tables/{table_name}/{id_val}")
def update_row(table_name: str, id_val: str, payload: Dict[str, Any] = Body(...)):
    if table_name not in TABLE_PKEYS:
        raise HTTPException(status_code=400, detail="Invalid table name")
    pk_col = TABLE_PKEYS[table_name].upper()
    try:
        p = {k.upper(): v for k, v in payload.items() if k.upper() != pk_col}
        set_clause = ", ".join([f"{k} = :{i+1}" for i, k in enumerate(p)])
        vals = list(p.values()) + [id_val]
        sql = f"UPDATE {table_name} SET {set_clause} WHERE {pk_col} = :{len(vals)}"
        conn = get_raw_connection(); cur = conn.cursor()
        cur.execute(sql, vals); conn.commit(); cur.close(); conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/internal/v1/tables/{table_name}/{id_val}")
def delete_row(table_name: str, id_val: str):
    if table_name not in TABLE_PKEYS:
        raise HTTPException(status_code=400, detail="Invalid table name")
    pk_col = TABLE_PKEYS[table_name].upper()
    try:
        conn = get_raw_connection(); cur = conn.cursor()
        cur.execute(f"DELETE FROM {table_name} WHERE {pk_col} = :1", [id_val])
        conn.commit(); cur.close(); conn.close()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=APP_HOST, port=APP_PORT)
