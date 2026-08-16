"""
Setup script: Creates all 5 AR dashboard tables in Oracle
and seeds them with sample data matching the dashboard's expected format.
Run once: python setup_tables.py
"""
import oracledb
import os
from dotenv import load_dotenv

load_dotenv()

conn = oracledb.connect(
    user=os.getenv("ORACLE_USER"),
    password=os.getenv("ORACLE_PASS"),
    dsn=os.getenv("ORACLE_DSN")
)
c = conn.cursor()
print("Connected to Oracle OK.\n")

# ─────────────────────────────────────────────
# Helper: drop table if exists before creating
# ─────────────────────────────────────────────
def drop_if_exists(table):
    try:
        c.execute(f"DROP TABLE {table}")
        conn.commit()
        print(f"  Dropped existing {table}")
    except oracledb.DatabaseError:
        pass  # table didn't exist, that's fine

# ═══════════════════════════════════════════════════════════
# 1. AR_SEGMEN_ERS_TBL  – AR Invoices Snapshot
# ═══════════════════════════════════════════════════════════
print("Creating AR_SEGMEN_ERS_TBL...")
drop_if_exists("AR_SEGMEN_ERS_TBL")
c.execute("""
    CREATE TABLE AR_SEGMEN_ERS_TBL (
        INVOICE_ID       NUMBER PRIMARY KEY,
        CUSTOMER_NAME    VARCHAR2(200),
        REGION           VARCHAR2(100),
        NILAI_M          NUMBER(18,4),
        AGING_CATEGORY   VARCHAR2(50),
        INVOICE_DATE     DATE,
        DUE_DATE         DATE
    )
""")
conn.commit()

data_inv = [
    (1,  'Preston Gonzalez',  'North America', 104.362, 'Within Due',  '01-JAN-20', '01-JUN-20'),
    (2,  'Daisy Blanco',      'Europe',         95.644, '0-30 Days',   '01-FEB-20', '01-MAY-20'),
    (3,  'Ruben Dominguez',   'Pacific',        88.463, '31-60 Days',  '01-MAR-20', '01-APR-20'),
    (4,  'Renee Carlson',     'North America',  86.619, '>90 Days',    '01-OCT-19', '01-DEC-19'),
    (5,  'Eugene Zhu',        'Europe',         84.952, '>90 Days',    '01-SEP-19', '01-NOV-19'),
    (6,  'Xavier Alexander',  'Pacific',        81.514, '61-90 Days',  '01-DEC-19', '01-MAR-20'),
    (7,  'Cedric Lin',        'North America',  81.456, 'Within Due',  '01-APR-20', '01-JUL-20'),
    (8,  'Janet Morris',      'Europe',         75.100, '0-30 Days',   '01-APR-20', '01-JUN-20'),
    (9,  'Tom Hansen',        'Pacific',        60.200, '31-60 Days',  '01-MAR-20', '01-MAY-20'),
    (10, 'Linda Park',        'North America',  55.300, 'Within Due',  '01-MAY-20', '01-AUG-20'),
]
c.executemany(
    "INSERT INTO AR_SEGMEN_ERS_TBL VALUES (:1,:2,:3,:4,:5,TO_DATE(:6,'DD-MON-YY'),TO_DATE(:7,'DD-MON-YY'))",
    data_inv
)
conn.commit()
print(f"  Inserted {len(data_inv)} rows.\n")

# ═══════════════════════════════════════════════════════════
# 2. AR_CASH_INFLOW_FORECAST_TBL
# ═══════════════════════════════════════════════════════════
print("Creating AR_CASH_INFLOW_FORECAST_TBL...")
drop_if_exists("AR_CASH_INFLOW_FORECAST_TBL")
c.execute("""
    CREATE TABLE AR_CASH_INFLOW_FORECAST_TBL (
        MONTH_LABEL          VARCHAR2(20) PRIMARY KEY,
        SORT_ORDER           NUMBER,
        ACTUAL_RECEIPTS      NUMBER(18,4),
        ESTIMATED_RECEIPTS   NUMBER(18,4),
        FORECASTED_RECEIPTS  NUMBER(18,4)
    )
""")
conn.commit()

data_inflow = [
    ('Nov 2019', 1, 3.0, 3.5, 0),
    ('Dec 2019', 2, 4.0, 5.0, 0),
    ('Jan 2020', 3, 4.1, 4.6, 0),
    ('Feb 2020', 4, 3.5, 4.6, 0),
    ('Mar 2020', 5, 4.0, 4.6, 0),
    ('Apr 2020', 6, 3.9, 4.9, 0),
    ('May 2020', 7, 4.6, 4.6, 0),
    ('Jun 2020', 8, 0,   0,   6.1),
    ('Jul 2020', 9, 0,   0,   6.0),
    ('Aug 2020',10, 0,   0,   1.4),
]
c.executemany("INSERT INTO AR_CASH_INFLOW_FORECAST_TBL VALUES (:1,:2,:3,:4,:5)", data_inflow)
conn.commit()
print(f"  Inserted {len(data_inflow)} rows.\n")

# ═══════════════════════════════════════════════════════════
# 3. AR_TREND_T13M_TBL
# ═══════════════════════════════════════════════════════════
print("Creating AR_TREND_T13M_TBL...")
drop_if_exists("AR_TREND_T13M_TBL")
c.execute("""
    CREATE TABLE AR_TREND_T13M_TBL (
        MONTH_LABEL  VARCHAR2(20) PRIMARY KEY,
        SORT_ORDER   NUMBER,
        WITHIN_DUE   NUMBER(18,4),
        OVER_DUE     NUMBER(18,4),
        CREDIT_SALES NUMBER(18,4)
    )
""")
conn.commit()

data_trend = [
    ('May 19', 1,  0.8, 0.6, 1.8),
    ('Jun 19', 2,  1.0, 0.8, 2.9),
    ('Jul 19', 3,  0.9, 0.8, 2.6),
    ('Aug 19', 4,  1.1, 0.9, 3.2),
    ('Sep 19', 5,  1.2, 1.0, 3.2),
    ('Oct 19', 6,  1.5, 1.2, 4.0),
    ('Nov 19', 7,  1.8, 1.4, 5.0),
    ('Dec 19', 8,  2.0, 1.6, 4.4),
    ('Jan 20', 9,  2.1, 1.8, 4.9),
    ('Feb 20', 10, 2.2, 2.0, 4.3),
    ('Mar 20', 11, 2.5, 2.3, 5.3),
    ('Apr 20', 12, 2.8, 2.6, 5.6),
    ('May 20', 13, 3.0, 3.3, 6.3),
]
c.executemany("INSERT INTO AR_TREND_T13M_TBL VALUES (:1,:2,:3,:4,:5)", data_trend)
conn.commit()
print(f"  Inserted {len(data_trend)} rows.\n")

# ═══════════════════════════════════════════════════════════
# 4. AR_METRICS_HISTORY_TBL  (DSO & Overdue % T12M sparklines)
# ═══════════════════════════════════════════════════════════
print("Creating AR_METRICS_HISTORY_TBL...")
drop_if_exists("AR_METRICS_HISTORY_TBL")
c.execute("""
    CREATE TABLE AR_METRICS_HISTORY_TBL (
        MONTH_LABEL  VARCHAR2(20) PRIMARY KEY,
        SORT_ORDER   NUMBER,
        OVERDUE_PCT  NUMBER(8,2),
        DSO          NUMBER(8,2)
    )
""")
conn.commit()

data_metrics = [
    ('Jun 19',  1,  42.0, 52),
    ('Jul 19',  2,  45.0, 53),
    ('Aug 19',  3,  40.0, 54),
    ('Sep 19',  4,  38.0, 50),
    ('Oct 19',  5,  44.0, 55),
    ('Nov 19',  6,  48.0, 58),
    ('Dec 19',  7,  43.0, 56),
    ('Jan 20',  8,  46.0, 59),
    ('Feb 20',  9,  49.0, 57),
    ('Mar 20', 10,  51.0, 61),
    ('Apr 20', 11,  53.0, 62),
    ('May 20', 12,  55.3, 60),
]
c.executemany("INSERT INTO AR_METRICS_HISTORY_TBL VALUES (:1,:2,:3,:4)", data_metrics)
conn.commit()
print(f"  Inserted {len(data_metrics)} rows.\n")

# ═══════════════════════════════════════════════════════════
# 5. AR_TOP_CUSTOMERS_TBL
# ═══════════════════════════════════════════════════════════
print("Creating AR_TOP_CUSTOMERS_TBL...")
drop_if_exists("AR_TOP_CUSTOMERS_TBL")
c.execute("""
    CREATE TABLE AR_TOP_CUSTOMERS_TBL (
        CUSTOMER_NAME       VARCHAR2(200) PRIMARY KEY,
        BALANCE             NUMBER(18,2),
        WITHIN_DUE          NUMBER(18,2),
        OVER_DUE            NUMBER(18,2),
        OVERDUE_PCT         NUMBER(8,2),
        DUE_INVOICES        NUMBER,
        ABOVE_CREDIT_LIMIT  NUMBER(1)
    )
""")
conn.commit()

data_cust = [
    ('Preston Gonzalez', 107469, 3108,  104362, 97.1,  12, 0),
    ('Daisy Blanco',     129330, 33686,  95644, 74.0,  11, 0),
    ('Ruben Dominguez',  141542, 53079,  88463, 62.5,   8, 1),
    ('Renee Carlson',     86619,     0,  86619,100.0,  10, 0),
    ('Eugene Zhu',        84952,     0,  84952,100.0,  10, 0),
    ('Xavier Alexander',  81766,   252,  81514, 99.7,  15, 0),
    ('Cedric Lin',       205563,124108,  81456, 39.6,  10, 1),
]
c.executemany("INSERT INTO AR_TOP_CUSTOMERS_TBL VALUES (:1,:2,:3,:4,:5,:6,:7)", data_cust)
conn.commit()
print(f"  Inserted {len(data_cust)} rows.\n")

conn.close()
print("=" * 50)
print("ALL TABLES CREATED AND SEEDED SUCCESSFULLY!")
print("=" * 50)
print("\nNow restart: python oracle_engine.py")
