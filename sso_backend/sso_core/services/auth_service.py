from google.oauth2 import id_token
from google.auth.transport import requests
from django.conf import settings
import jwt
from datetime import datetime, timedelta
from typing import Dict, Any

from sso_core.repositories.user_repository import UserRepository
from sso_core.repositories.role_repository import RoleRepository
import os
import requests as py_requests

class AuthService:
    # Set this in settings or env in production
    JWT_SECRET = os.getenv('JWT_SECRET')
    JWT_ALGORITHM = os.getenv('JWT_ALGORITHM')
    ACCESS_TOKEN_LIFETIME = timedelta(minutes=int(os.getenv('ACCESS_TOKEN_LIFETIME')))
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')

    @classmethod
    def verify_google_token_and_login(cls, token: str) -> Dict[str, Any]:
        """Verifies Google token, gets or creates user, and issues JWT."""
        try:
            response = py_requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {token}'}
            )
            if not response.ok:
                raise ValueError(f"Invalid Google token: {response.text}")
            
            idinfo = response.json()
            
            email = idinfo.get('email')
            google_uid = idinfo.get('sub')
            first_name = idinfo.get('given_name', '')
            last_name = idinfo.get('family_name', '')
            avatar_url = idinfo.get('picture', '')

            if not email:
                raise ValueError("Google token did not provide an email.")

            # Get or Create User
            user = UserRepository.get_user_by_email(email)
            if not user:
                user = UserRepository.create_user(
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    google_uid=google_uid,
                    avatar_url=avatar_url
                )

            # Issue JWT
            payload = {
                "user_id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "exp": datetime.utcnow() + cls.ACCESS_TOKEN_LIFETIME,
                "iat": datetime.utcnow()
            }
            access_token = jwt.encode(payload, cls.JWT_SECRET, algorithm=cls.JWT_ALGORITHM)
            print("access_token: ", access_token)

            return {
                "access_token": access_token,
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "avatar_url": user.avatar_url
                }
            }

        except ValueError as e:
            # Invalid token
            raise Exception(f"Invalid Google token: {str(e)}")

    @classmethod
    def get_authorized_modules(cls, user_id: str) -> list:
        return RoleRepository.get_user_authorized_modules(user_id)

    @classmethod
    def decode_jwt(cls, token: str) -> Dict[str, Any]:
        try:
            payload = jwt.decode(token, cls.JWT_SECRET, algorithms=[cls.JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            raise Exception("Token has expired")
        except jwt.InvalidTokenError:
            raise Exception("Invalid token")
