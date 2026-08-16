import oracledb, os
from dotenv import load_dotenv
load_dotenv()

conn = oracledb.connect(
    user=os.getenv("ORACLE_USER"),
    password=os.getenv("ORACLE_PASS"),
    dsn=os.getenv("ORACLE_DSN")
)
c = conn.cursor()

print("=== Connected as user:", os.getenv("ORACLE_USER"), "===\n")

# Search ALL schemas for AR tables
c.execute("SELECT OWNER, TABLE_NAME FROM ALL_TABLES WHERE TABLE_NAME LIKE 'AR_%' ORDER BY OWNER, TABLE_NAME")
rows = c.fetchall()
if rows:
    print("AR tables found across ALL schemas:")
    for r in rows:
        print(f"  Schema: {r[0]}  Table: {r[1]}")
else:
    print("No AR_* tables found in ANY schema accessible to this user.")

print()

# List all non-system schemas that have tables
c.execute("SELECT DISTINCT OWNER FROM ALL_TABLES WHERE OWNER NOT IN ('SYS','SYSTEM','OUTLN','XDB','CTXSYS','MDSYS','ORDPLUGINS','ORDSYS','WMSYS','APPQOSSYS','OJVMSYS') ORDER BY OWNER")
schemas = c.fetchall()
print("User/application schemas with tables:")
for s in schemas:
    print(f"  {s[0]}")

conn.close()
