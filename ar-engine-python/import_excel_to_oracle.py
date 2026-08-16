"""
Import Excel to Oracle DB
==========================
Membaca file Open-Item Excel (semua sheet per bulan) lalu memasukkan
data ke AR_SEGMEN_ERS_TBL dan AR_TOP_CUSTOMERS_TBL.

Sesuai reports.md:
  - Membaca berdasarkan nama header (bukan posisi kolom tetap)
  - Menyimpan segmen PENGELOLAAN, BP_NUM, NIPNAS, WITEL, SATKER, REG
  - Menandai STATUS_INVOICE (SUDAH INVOICE / BELUM INVOICE)
  - Multi-sheet: OI 202606, OI 202607, OI 202608 / Detail
"""

import oracledb
import os
import pandas as pd
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

ORACLE_USER = os.getenv("ORACLE_USER", "system")
ORACLE_PASS = os.getenv("ORACLE_PASS", "sys")
ORACLE_DSN  = os.getenv("ORACLE_DSN",  "localhost:1521/XE")
excel_path  = os.path.join(os.path.dirname(__file__), "Open-Item-Snapshot-13-Agustus-2026.xlsx")

# Map sheet name -> human-readable month label
SHEET_MONTH_MAP = {
    "Detail":                       "Agustus 2026",
    "OI 202608":                    "Agustus 2026",
    "Sheet Update Nilai AR (Tio)":  "Agustus 2026",
    "Update Nilai AR (Tio Juli)":   "Juli 2026",
    "OI 202607":                    "Juli 2026",
    "OI 202606":                    "Juni 2026",
}

# Valid invoice categories from the sheet header columns
SUDAH_INVOICE_CATS = ['SUDAH INVOICE']
BELUM_INVOICE_CATS = ['KONTRAK', 'BAST/BAPP', 'REKON/SLG', 'TERMYN', 'PROSES IDENTIFIKASI', 'KOREKSI', 'CHECKER']
VALID_CATEGORIES   = SUDAH_INVOICE_CATS + BELUM_INVOICE_CATS

# Aging bracket index -> (label, db_aging_cat, status_tagih)
# Reports.md: Aging > 24bln & 13-24bln = Tidak Layak, 0bln = Layak, in-between = Bermasalah
AGING_MAP = {
    0: ("Aging >24 Bln",   ">90 Days",    "AR TIDAK LAYAK TAGIH"),
    1: ("Aging 13-24 Bln", ">90 Days",    "AR TIDAK LAYAK TAGIH"),
    2: ("Aging 7-12 Bln",  "61-90 Days",  "AR BERMASALAH"),
    3: ("Aging 4-6 Bln",   "31-60 Days",  "AR BERMASALAH"),
    4: ("Aging 1-3 Bln",   "0-30 Days",   "AR BERMASALAH"),
    5: ("Aging 0 Bln",     "Within Due",  "AR LAYAK TAGIH"),
}


def safe_str(val, max_len=100, default=""):
    """Safely convert a value to string, truncating to max_len."""
    if val is None or (isinstance(val, float) and val != val):
        return default
    return str(val).strip()[:max_len]


def parse_sheet(df_raw: pd.DataFrame, df_data: pd.DataFrame, report_month: str) -> list:
    """Parse one sheet and return list of invoice tuples for AR_SEGMEN_ERS_TBL."""
    row0 = df_raw.iloc[0].tolist()

    # Build category column ranges from Row 0 labels
    category_ranges = {}
    current_category = None
    start_idx = None
    for idx, val in enumerate(row0):
        if pd.notna(val):
            if current_category is not None:
                category_ranges[current_category] = (start_idx, idx)
            current_category = str(val).strip()
            start_idx = idx
    if current_category is not None:
        category_ranges[current_category] = (start_idx, len(row0))

    raw_col_names = df_data.columns.tolist()
    invoices = []
    counter = 0

    for cat_name, (start, end) in category_ranges.items():
        if cat_name not in VALID_CATEGORIES:
            continue
        status_invoice = "SUDAH INVOICE" if cat_name in SUDAH_INVOICE_CATS else "BELUM INVOICE"

        for offset in range(6):
            col_idx = start + offset
            if col_idx >= end or col_idx >= len(raw_col_names):
                continue
            col_name_in_df = raw_col_names[col_idx]
            _aging_label, db_aging_cat, status_tagih = AGING_MAP[offset]

            for row_idx, row in df_data.iterrows():
                raw_val = row.get(col_name_in_df)
                try:
                    val = float(raw_val)
                except (TypeError, ValueError):
                    continue
                if val == 0.0 or val != val:  # skip zero and NaN
                    continue

                # Identity fields
                customer_name = safe_str(row.get('NAME'), 100)
                ca            = safe_str(row.get('CA'), 30)
                bp_num        = safe_str(row.get('BP NUM'), 30)
                nipnas        = safe_str(row.get('NIPNAS'), 30)
                pengelolaan   = safe_str(row.get('PENGELOLAAN'), 10)
                region        = safe_str(row.get('AREA'), 50)
                witel         = safe_str(row.get('WITEL'), 50)
                satker        = safe_str(row.get('SATKER'), 100)
                reg           = safe_str(row.get('REG'), 50)
                uic           = safe_str(row.get('PENGELOLAAN'), 50) or 'ERS'
                action_plan   = safe_str(row.get('UNLOCK'), 200) or 'Normal collection'
                nilai_m       = round(float(val) / 1e9, 6)

                counter += 1
                invoice_id = f"{report_month[:3].upper()}{ca[:8]}-{cat_name[:4]}-{offset}-{row_idx}"[:50]

                invoices.append((
                    invoice_id,        # 1  INVOICE_ID
                    customer_name,     # 2  CUSTOMER_NAME
                    db_aging_cat,      # 3  AGING_CATEGORY
                    status_tagih,      # 4  STATUS_TAGIH
                    region,            # 5  REGION
                    cat_name[:50],     # 6  INVOICE_STATUS
                    nilai_m,           # 7  NILAI_M
                    uic,               # 8  UIC
                    report_month[:30], # 9  DUE_DATE
                    action_plan,       # 10 ACTION_PLAN
                    0,                 # 11 ABOVE_CREDIT_LIMIT
                    report_month[:20], # 12 REPORT_MONTH
                    pengelolaan,       # 13 PENGELOLAAN
                    bp_num,            # 14 BP_NUM
                    nipnas,            # 15 NIPNAS
                    witel,             # 16 WITEL
                    satker,            # 17 SATKER
                    reg,               # 18 REG
                    status_invoice,    # 19 STATUS_INVOICE
                ))

    return invoices


def main():
    if not os.path.exists(excel_path):
        print(f"ERROR: File not found at {excel_path}")
        return

    print(f"Reading: {excel_path}")
    xl = pd.ExcelFile(excel_path)
    print(f"Sheets: {xl.sheet_names}")

    all_invoices = []
    processed_months = set()

    for sheet_name in xl.sheet_names:
        if sheet_name not in SHEET_MONTH_MAP:
            print(f"  Skipping unknown sheet: {sheet_name}")
            continue
        report_month = SHEET_MONTH_MAP[sheet_name]
        if report_month in processed_months:
            print(f"  Skipping '{sheet_name}' ('{report_month}' already processed)")
            continue

        print(f"  Processing '{sheet_name}' -> {report_month} ...")
        try:
            df_raw  = xl.parse(sheet_name, header=None)
            df_data = xl.parse(sheet_name, header=2)
            df_data.columns = [str(c).strip() for c in df_data.columns]
        except Exception as e:
            print(f"    ERROR: {e}")
            continue

        sheet_invoices = parse_sheet(df_raw, df_data, report_month)
        all_invoices.extend(sheet_invoices)
        processed_months.add(report_month)
        print(f"    -> {len(sheet_invoices)} records")

    print(f"\nTotal: {len(all_invoices)} invoice records across {len(processed_months)} months")

    # Build customer aggregation (key = customer_name + report_month for uniqueness)
    cust_agg = {}
    for inv in all_invoices:
        cname, aging_cat, nilai_m, rmonth = inv[1], inv[2], inv[6], inv[11]
        pengelolaan = inv[12]
        key = f"{cname}|||{rmonth}"
        if key not in cust_agg:
            cust_agg[key] = {
                "name": cname, "month": rmonth, "pengelolaan": pengelolaan,
                "balance": 0.0, "within_due": 0.0, "over_due": 0.0, "due_invoices": 0
            }
        cust_agg[key]["balance"] += nilai_m
        if aging_cat == "Within Due":
            cust_agg[key]["within_due"] += nilai_m
        else:
            cust_agg[key]["over_due"] += nilai_m
            cust_agg[key]["due_invoices"] += 1

    top_customers = []
    for agg in cust_agg.values():
        if not agg["name"].strip():  # skip empty customer names
            continue
        total = agg["balance"]
        ov    = agg["over_due"]
        pct   = max(0.0, min(100.0, ov / total * 100 if total > 0 else 0.0))
        top_customers.append((
            agg["name"][:100],
            round(total * 1e3, 2),
            round(agg["within_due"] * 1e3, 2),
            round(ov * 1e3, 2),
            round(pct, 2),
            agg["due_invoices"],
            0,
            agg["month"][:20],
        ))


    print(f"Total: {len(top_customers)} customer aggregates")

    # ── Write to Oracle ────────────────────────────────
    print(f"\nConnecting to Oracle DB ...")
    conn   = oracledb.connect(user=ORACLE_USER, password=ORACLE_PASS, dsn=ORACLE_DSN)
    cursor = conn.cursor()

    print("Clearing existing rows ...")
    cursor.execute("DELETE FROM AR_SEGMEN_ERS_TBL")
    cursor.execute("DELETE FROM AR_TOP_CUSTOMERS_TBL")
    conn.commit()

    print("Inserting invoice rows (in batches of 500) ...")
    sql_inv = """
        INSERT INTO AR_SEGMEN_ERS_TBL (
            INVOICE_ID, CUSTOMER_NAME, AGING_CATEGORY, STATUS_TAGIH, REGION,
            INVOICE_STATUS, NILAI_M, UIC, DUE_DATE, ACTION_PLAN, ABOVE_CREDIT_LIMIT,
            REPORT_MONTH, PENGELOLAAN, BP_NUM, NIPNAS, WITEL, SATKER, REG, STATUS_INVOICE
        ) VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19)
    """
    for i in range(0, len(all_invoices), 500):
        cursor.executemany(sql_inv, all_invoices[i:i+500])
        conn.commit()
        print(f"  Batch {i//500+1}: {min(i+500, len(all_invoices))} / {len(all_invoices)}")

    print("Inserting customer rows ...")
    sql_cust = """
        INSERT INTO AR_TOP_CUSTOMERS_TBL (
            CUSTOMER_NAME, BALANCE, WITHIN_DUE, OVER_DUE,
            OVERDUE_PCT, DUE_INVOICES, ABOVE_CREDIT_LIMIT, REPORT_MONTH
        ) VALUES (:1,:2,:3,:4,:5,:6,:7,:8)
    """
    for i in range(0, len(top_customers), 500):
        cursor.executemany(sql_cust, top_customers[i:i+500])
        conn.commit()

    cursor.close()
    conn.close()
    print(f"\n[OK] Import complete! {len(all_invoices)} invoices, {len(top_customers)} customers.")
    print(f"     Months: {', '.join(sorted(processed_months))}")


if __name__ == "__main__":
    main()
