import os
import oracledb
from dotenv import load_dotenv

# Load credentials from ar-engine-python/.env
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "ar-engine-python", ".env")
load_dotenv(dotenv_path)

ORACLE_USER = os.getenv("ORACLE_USER", "system")
ORACLE_PASS = os.getenv("ORACLE_PASS", "sys")
ORACLE_DSN = os.getenv("ORACLE_DSN", "localhost:1521/XE")

def execute_sql():
    print(f"Connecting to Oracle DB at {ORACLE_DSN} as {ORACLE_USER}...")
    conn = oracledb.connect(user=ORACLE_USER, password=ORACLE_PASS, dsn=ORACLE_DSN)
    cursor = conn.cursor()

    # Drop existing tables if they exist
    tables_to_drop = [
        "AR_SEGMEN_ERS_TBL",
        "AR_CASH_INFLOW_FORECAST_TBL",
        "AR_TREND_T13M_TBL",
        "AR_METRICS_HISTORY_TBL",
        "AR_TOP_CUSTOMERS_TBL"
    ]

    for table in tables_to_drop:
        try:
            cursor.execute(f"DROP TABLE {table} CASCADE CONSTRAINTS")
            print(f"Dropped table {table}")
        except oracledb.DatabaseError as e:
            # Table might not exist, which is fine
            pass

    # Create AR_SEGMEN_ERS_TBL (Invoices snapshot)
    cursor.execute("""
        CREATE TABLE AR_SEGMEN_ERS_TBL (
            INVOICE_ID VARCHAR2(50) PRIMARY KEY,
            CUSTOMER_NAME VARCHAR2(100),
            AGING_CATEGORY VARCHAR2(50),
            STATUS_TAGIH VARCHAR2(50),
            REGION VARCHAR2(50),
            INVOICE_STATUS VARCHAR2(50),
            NILAI_M NUMBER(18,2),
            UIC VARCHAR2(50),
            DUE_DATE VARCHAR2(30),
            ACTION_PLAN VARCHAR2(200),
            ABOVE_CREDIT_LIMIT NUMBER(1) DEFAULT 0
        )
    """)
    print("Created AR_SEGMEN_ERS_TBL")

    # Create AR_CASH_INFLOW_FORECAST_TBL
    cursor.execute("""
        CREATE TABLE AR_CASH_INFLOW_FORECAST_TBL (
            MONTH_LABEL VARCHAR2(30) PRIMARY KEY,
            SORT_ORDER NUMBER(3),
            ACTUAL_RECEIPTS NUMBER(18,2) DEFAULT 0,
            ESTIMATED_RECEIPTS NUMBER(18,2) DEFAULT 0,
            FORECASTED_RECEIPTS NUMBER(18,2) DEFAULT 0
        )
    """)
    print("Created AR_CASH_INFLOW_FORECAST_TBL")

    # Create AR_TREND_T13M_TBL
    cursor.execute("""
        CREATE TABLE AR_TREND_T13M_TBL (
            MONTH_LABEL VARCHAR2(30) PRIMARY KEY,
            SORT_ORDER NUMBER(3),
            WITHIN_DUE NUMBER(18,2) DEFAULT 0,
            OVER_DUE NUMBER(18,2) DEFAULT 0,
            CREDIT_SALES NUMBER(18,2) DEFAULT 0
        )
    """)
    print("Created AR_TREND_T13M_TBL")

    # Create AR_METRICS_HISTORY_TBL
    cursor.execute("""
        CREATE TABLE AR_METRICS_HISTORY_TBL (
            MONTH_LABEL VARCHAR2(30) PRIMARY KEY,
            SORT_ORDER NUMBER(3),
            OVERDUE_PCT NUMBER(5,2),
            DSO NUMBER(5)
        )
    """)
    print("Created AR_METRICS_HISTORY_TBL")

    # Create AR_TOP_CUSTOMERS_TBL
    cursor.execute("""
        CREATE TABLE AR_TOP_CUSTOMERS_TBL (
            CUSTOMER_NAME VARCHAR2(100) PRIMARY KEY,
            BALANCE NUMBER(18,2),
            WITHIN_DUE NUMBER(18,2),
            OVER_DUE NUMBER(18,2),
            OVERDUE_PCT NUMBER(5,2),
            DUE_INVOICES NUMBER(5),
            ABOVE_CREDIT_LIMIT NUMBER(1) DEFAULT 0
        )
    """)
    print("Created AR_TOP_CUSTOMERS_TBL")

    # Seed Invoices (AR_SEGMEN_ERS_TBL) to match overview totals:
    # Balance: 14.89M, Within Due: 6.65M, Over Due: 8.24M
    # Regions Overdue: North America (3.5M), Europe (2.7M), Pacific (2.1M)
    # Aging: Within Due (6.6M), 0-30 Days (2.2M), 31-60 Days (1.1M), 61-90 Days (0.8M), >90 Days (4.1M)
    invoices = [
        # Within Due (Total: 6.65M)
        ("INV-2020-001", "Daisy Blanco", "Within Due", "AR LAYAK TAGIH", "North America", "SUDAH INVOICED", 1.50, "CGA", "2020-06-15", "Normal collection", 0),
        ("INV-2020-002", "Cedric Lin", "Within Due", "AR LAYAK TAGIH", "Europe", "SUDAH INVOICED", 2.15, "SEGMEN", "2020-06-20", "Normal collection", 0),
        ("INV-2020-003", "Xavier Alexander", "Within Due", "AR LAYAK TAGIH", "Pacific", "SUDAH INVOICED", 1.00, "CGA", "2020-06-25", "Normal collection", 0),
        ("INV-2020-004", "Preston Gonzalez", "Within Due", "AR LAYAK TAGIH", "North America", "SUDAH INVOICED", 0.80, "CGA", "2020-07-01", "Normal collection", 0),
        ("INV-2020-005", "Ruben Dominguez", "Within Due", "AR LAYAK TAGIH", "Europe", "SUDAH INVOICED", 1.20, "BILLING", "2020-07-05", "Normal collection", 0),

        # Over Due 0-30 Days (Total: 2.2M)
        ("INV-2020-006", "Daisy Blanco", "0-30 Days", "AR LAYAK TAGIH", "Europe", "SUDAH INVOICED", 0.90, "BILLING", "2020-05-10", "Follow up invoice", 0),
        ("INV-2020-007", "Cedric Lin", "0-30 Days", "AR LAYAK TAGIH", "North America", "SUDAH INVOICED", 1.30, "SEGMEN", "2020-05-12", "Send payment link", 0),

        # Over Due 31-60 Days (Total: 1.1M)
        ("INV-2020-008", "Preston Gonzalez", "31-60 Days", "AR BERMASALAH", "Pacific", "SUDAH INVOICED", 0.50, "CGA", "2020-04-15", "Call client", 0),
        ("INV-2020-009", "Ruben Dominguez", "31-60 Days", "AR BERMASALAH", "Europe", "SUDAH INVOICED", 0.60, "BILLING", "2020-04-20", "Escalate to manager", 1),

        # Over Due 61-90 Days (Total: 0.8M)
        ("INV-2020-010", "Xavier Alexander", "61-90 Days", "AR BERMASALAH", "North America", "SUDAH INVOICED", 0.80, "CGA", "2020-03-10", "Legal notice drafted", 0),

        # Over Due >90 Days (Total: 4.1M)
        ("INV-2020-011", "Renee Carlson", ">90 Days", "AR TIDAK LAYAK TAGIH", "Europe", "UNBILLED", 1.50, "SEGMEN", "2020-01-05", "Write-off candidate", 0),
        ("INV-2020-012", "Eugene Zhu", ">90 Days", "AR TIDAK LAYAK TAGIH", "Pacific", "UNBILLED", 1.20, "CGA", "2020-01-10", "Write-off candidate", 0),
        ("INV-2020-013", "Preston Gonzalez", ">90 Days", "AR TIDAK LAYAK TAGIH", "North America", "SUDAH INVOICED", 1.40, "BILLING", "2019-12-15", "Debt collector assigned", 0),
    ]

    for inv in invoices:
        cursor.execute("""
            INSERT INTO AR_SEGMEN_ERS_TBL 
            (INVOICE_ID, CUSTOMER_NAME, AGING_CATEGORY, STATUS_TAGIH, REGION, INVOICE_STATUS, NILAI_M, UIC, DUE_DATE, ACTION_PLAN, ABOVE_CREDIT_LIMIT)
            VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11)
        """, inv)
    print(f"Seeded {len(invoices)} invoices into AR_SEGMEN_ERS_TBL")

    # Seed Cash Inflow & Forecast Table
    cash_inflows = [
        ("Nov 2019", 1, 3.0, 3.5, 0.0),
        ("Dec 2019", 2, 4.0, 5.0, 0.0),
        ("Jan 2020", 3, 4.1, 4.6, 0.0),
        ("Feb 2020", 4, 3.5, 4.6, 0.0),
        ("Mar 2020", 5, 4.0, 4.6, 0.0),
        ("Apr 2020", 6, 3.9, 4.9, 0.0),
        ("May 2020", 7, 4.6, 4.6, 0.0),
        ("Jun 2020", 8, 0.0, 0.0, 6.1),
        ("Jul 2020", 9, 0.0, 0.0, 6.0),
        ("Aug 2020", 10, 0.0, 0.0, 1.4)
    ]
    for ci in cash_inflows:
        cursor.execute("""
            INSERT INTO AR_CASH_INFLOW_FORECAST_TBL (MONTH_LABEL, SORT_ORDER, ACTUAL_RECEIPTS, ESTIMATED_RECEIPTS, FORECASTED_RECEIPTS)
            VALUES (:1, :2, :3, :4, :5)
        """, ci)
    print("Seeded AR_CASH_INFLOW_FORECAST_TBL")

    # Seed T13M Trend Table
    trends = [
        ("May 2019", 1, 0.8, 0.6, 1.8),
        ("Jun 2019", 2, 1.0, 0.8, 2.9),
        ("Jul 2019", 3, 0.9, 0.8, 2.6),
        ("Aug 2019", 4, 1.1, 0.9, 3.2),
        ("Sep 2019", 5, 1.2, 1.0, 3.2),
        ("Oct 2019", 6, 1.5, 1.2, 4.0),
        ("Nov 2019", 7, 1.8, 1.4, 5.0),
        ("Dec 2019", 8, 2.0, 1.6, 4.4),
        ("Jan 2020", 9, 2.1, 1.8, 4.9),
        ("Feb 2020", 10, 2.2, 2.0, 4.3),
        ("Mar 2020", 11, 2.5, 2.3, 5.3),
        ("Apr 2020", 12, 2.8, 2.6, 5.6),
        ("May 2020", 13, 3.0, 3.3, 6.3)
    ]
    for tr in trends:
        cursor.execute("""
            INSERT INTO AR_TREND_T13M_TBL (MONTH_LABEL, SORT_ORDER, WITHIN_DUE, OVER_DUE, CREDIT_SALES)
            VALUES (:1, :2, :3, :4, :5)
        """, tr)
    print("Seeded AR_TREND_T13M_TBL")

    # Seed Metrics History Table (for Sparklines: Over Due % & DSO)
    metrics_history = [
        ("Jun 2019", 1, 42.0, 52),
        ("Jul 2019", 2, 45.0, 53),
        ("Aug 2019", 3, 40.5, 54),
        ("Sep 2019", 4, 38.0, 50),
        ("Oct 2019", 5, 44.0, 55),
        ("Nov 2019", 6, 48.0, 58),
        ("Dec 2019", 7, 43.0, 56),
        ("Jan 2020", 8, 46.0, 59),
        ("Feb 2020", 9, 49.0, 57),
        ("Mar 2020", 10, 51.5, 61),
        ("Apr 2020", 11, 53.0, 62),
        ("May 2020", 12, 55.3, 60)
    ]
    for mh in metrics_history:
        cursor.execute("""
            INSERT INTO AR_METRICS_HISTORY_TBL (MONTH_LABEL, SORT_ORDER, OVERDUE_PCT, DSO)
            VALUES (:1, :2, :3, :4)
        """, mh)
    print("Seeded AR_METRICS_HISTORY_TBL")

    # Seed Top Customers Table
    customers = [
        ("Preston Gonzalez", 107469, 3108, 104362, 97.1, 12, 0),
        ("Daisy Blanco", 129330, 33686, 95644, 74.0, 11, 0),
        ("Ruben Dominguez", 141542, 53079, 88463, 62.5, 8, 1),
        ("Renee Carlson", 86619, 0, 86619, 100.0, 10, 0),
        ("Eugene Zhu", 84952, 0, 84952, 100.0, 10, 0),
        ("Xavier Alexander", 81766, 252, 81514, 99.7, 15, 0),
        ("Cedric Lin", 205563, 124108, 81456, 39.6, 10, 1)
    ]
    for cust in customers:
        cursor.execute("""
            INSERT INTO AR_TOP_CUSTOMERS_TBL (CUSTOMER_NAME, BALANCE, WITHIN_DUE, OVER_DUE, OVERDUE_PCT, DUE_INVOICES, ABOVE_CREDIT_LIMIT)
            VALUES (:1, :2, :3, :4, :5, :6, :7)
        """, cust)
    print("Seeded AR_TOP_CUSTOMERS_TBL")

    conn.commit()
    cursor.close()
    conn.close()
    print("Database seeding completed successfully!")

if __name__ == "__main__":
    execute_sql()
