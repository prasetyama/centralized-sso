import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from sso_core.models import User

# Check if accessing title_id works
try:
    user = User.objects.first()
    if user:
        tm = user.user_title_matrixes.first()
        if tm:
            print(f"Title ID: {tm.title_id}")
            print(f"Title object: {tm.title}")
        else:
            print("No title matrix for first user.")
    else:
        print("No users.")
except Exception as e:
    print(f"Error: {e}")
