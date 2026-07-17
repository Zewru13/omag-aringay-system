from django.db import connection

tables_to_check = [
    "monitoring_aquacultureproductioncycle",
    "monitoring_aquaculturefeedinglog",
    "monitoring_aquaculturehealthlog",
    "monitoring_fisheryinputlog",
]

with connection.cursor() as c:
    for table in tables_to_check:
        try:
            c.execute(f"SHOW COLUMNS FROM {table}")
            cols = [row[0] for row in c.fetchall()]
            print(f"{table}: {cols}")
        except Exception as e:
            print(f"{table}: ERROR -> {e}")
