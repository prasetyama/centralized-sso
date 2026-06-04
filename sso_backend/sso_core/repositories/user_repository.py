from typing import Optional
from sso_core.models import User

class UserRepository:
    @staticmethod
    def get_user_by_email(email: str) -> Optional[User]:
        return User.objects.filter(email=email, is_active=True).first()

    @staticmethod
    def create_user(email: str, first_name: str, last_name: str = "", google_uid: str = "", avatar_url: str = "") -> User:
        return User.objects.create(
            email=email,
            first_name=first_name,
            last_name=last_name,
            google_uid=google_uid,
            avatar_url=avatar_url
        )

    @staticmethod
    def get_user_by_id(user_id: str) -> Optional[User]:
        return User.objects.filter(id=user_id, is_active=True).first()
