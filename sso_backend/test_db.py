import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection

q = "ALTER TABLE `user_module_role` MODIFY `email` varchar(254) COLLATE utf8mb4_general_ci NOT NULL;"

with connection.cursor() as cursor:
    cursor.execute(q)
    print("Altered email column in user_module_role")
