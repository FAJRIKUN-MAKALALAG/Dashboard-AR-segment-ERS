"""
Diagnostic: Find the correct Oracle service name / SID to use in the DSN.
Tries common service names and also uses Oracle's listener status query.
"""
import oracledb
import os
from dotenv import load_dotenv

load_dotenv()

USER = os.getenv("ORACLE_USER", "system")
PASS = os.getenv("ORACLE_PASS", "sys")
HOST = "localhost"
PORT = 1521

print(f"Oracle host: {HOST}:{PORT}")
print(f"Oracle user: {USER}")
print()

# Try all common Oracle XE service names
candidates = [
    "XE",           # Classic XE
    "XEPDB1",       # XE 21c pluggable DB
    "ORCL",         # Full Oracle
    "FREE",         # Oracle 23c free
    "FREEPDB1",     # Oracle 23c pluggable DB
    "ORCLPDB1",     # Full Oracle pluggable DB
    "localhost",    # Sometimes works as bare host
]

for svc in candidates:
    dsn = f"{HOST}:{PORT}/{svc}"
    try:
        conn = oracledb.connect(user=USER, password=PASS, dsn=dsn)
        print(f"[OK]   SUCCESS  ->  DSN = {dsn}")
        # Also list any AR tables visible
        c = conn.cursor()
        c.execute("SELECT TABLE_NAME FROM ALL_TABLES WHERE TABLE_NAME LIKE 'AR_%' ORDER BY TABLE_NAME")
        ar_tables = c.fetchall()
        if ar_tables:
            print(f"   AR tables found: {[r[0] for r in ar_tables]}")
        else:
            print("   No AR_* tables in this connection (wrong schema or not yet created).")
        conn.close()
    except oracledb.DatabaseError as e:
        print(f"[FAIL] FAILED   ->  DSN = {dsn}  [{e}]")

print()
print("Use the [OK] DSN above in your .env file as ORACLE_DSN=...")
