import os
import sys
import jwt
from datetime import datetime, timedelta
import requests
from dotenv import load_dotenv

load_dotenv('/home/pras/Works/sso/sso_backend/.env')

# Let's just create a dummy token or we can query the DB.
# If we don't have a user, it doesn't matter, we just want to see the error from the try block.
# Wait, get_user_from_token requires a valid token signed with JWT_SECRET.
secret = os.getenv('JWT_SECRET')
algo = os.getenv('JWT_ALGORITHM', 'HS256')

payload = {
    "user_id": "dummy",
    "email": "dummy@example.com",
    "first_name": "dummy",
    "exp": datetime.utcnow() + timedelta(minutes=60),
    "iat": datetime.utcnow()
}
token = jwt.encode(payload, secret, algorithm=algo)

res = requests.get('http://127.0.0.1:8000/api/v1/user/menu-access/', headers={'Authorization': f'Bearer {token}'})
print(res.status_code)
print(res.text)
