import bcrypt
from django.test import TestCase, Client
from django.urls import reverse
from sso_core.models import LocalUser

class ManualLoginViewTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        hashed_pw = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode('utf-8')
        self.user = LocalUser.objects.create(
            username="testuser",
            email="testuser@example.com",
            password=hashed_pw,
            fname="Test User",
            department="IT",
            role="user"
        )
        self.login_url = reverse('manual-login')

    def test_login_with_username_success(self):
        response = self.client.post(
            self.login_url,
            data={"username": "testuser", "password": "password123"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.data)
        self.assertEqual(response.data["user"]["username"], "testuser")

    def test_login_with_email_success(self):
        response = self.client.post(
            self.login_url,
            data={"username": "testuser@example.com", "password": "password123"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.data)
        self.assertEqual(response.data["user"]["email"], "testuser@example.com")

    def test_login_with_email_field_payload(self):
        response = self.client.post(
            self.login_url,
            data={"email": "testuser@example.com", "password": "password123"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.data)
        self.assertEqual(response.data["user"]["email"], "testuser@example.com")

    def test_login_invalid_credentials(self):
        response = self.client.post(
            self.login_url,
            data={"username": "nonexistent", "password": "password123"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 401)

    def test_login_wrong_password(self):
        response = self.client.post(
            self.login_url,
            data={"username": "testuser", "password": "wrongpassword"},
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 401)
