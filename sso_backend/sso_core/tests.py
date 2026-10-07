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


from sso_core.admin import LocalUserForm

class LocalUserModelAndFormTestCase(TestCase):
    def test_set_and_check_password(self):
        user = LocalUser(username="testmodel")
        user.set_password("mysecret123")
        self.assertTrue(user.password.startswith("$2"))
        self.assertTrue(user.check_password("mysecret123"))
        self.assertFalse(user.check_password("wrongsecret"))

    def test_local_user_form_create(self):
        form_data = {
            "username": "formuser",
            "password": "formpassword123",
            "role": "user"
        }
        form = LocalUserForm(data=form_data)
        self.assertTrue(form.is_valid())
        user = form.save(commit=False)
        self.assertTrue(user.check_password("formpassword123"))

    def test_local_user_form_update_without_password_change(self):
        user = LocalUser(username="edituser")
        user.set_password("oldpass123")
        user.save()
        old_hash = user.password

        form_data = {
            "username": "edituser",
            "password": "",  # left blank
            "role": "user"
        }
        form = LocalUserForm(data=form_data, instance=user)
        self.assertTrue(form.is_valid())
        updated_user = form.save(commit=False)
        self.assertEqual(updated_user.password, old_hash)
        self.assertTrue(updated_user.check_password("oldpass123"))


from sso_core.models import LoginLog
from sso_core.views import get_last_login, get_last_login_map, log_login

class LastLoginTestCase(TestCase):
    def test_last_login_property_and_map(self):
        user = LocalUser(username="testlastlogin", email="lastlogin@example.com")
        self.assertIsNone(user.last_login)

        # Log a successful login attempt
        log_login(None, "lastlogin@example.com", "manual", True)

        # Check property & helper functions
        last_login_ts = get_last_login("lastlogin@example.com")
        self.assertIsNotNone(last_login_ts)

        mapping = get_last_login_map(["lastlogin@example.com", "nonexistent@example.com"])
        self.assertIn("lastlogin@example.com", mapping)
        self.assertNotIn("nonexistent@example.com", mapping)
        self.assertEqual(user.last_login, last_login_ts)

    def test_admin_last_login_display(self):
        from sso_core.admin import LocalUserAdmin
        local_user_admin = LocalUserAdmin(LocalUser, None)
        user = LocalUser(username="testadmindisplay")
        
        # Test display when last_login is None (must not raise TypeError)
        res_empty = local_user_admin.last_login_display(user)
        self.assertIn("Belum Login", str(res_empty))

        # Test display when user has logged in
        log_login(None, "testadmindisplay", "manual", True)
        res_logged = local_user_admin.last_login_display(user)
        self.assertIn("color: #16a34a", str(res_logged))

    def test_has_logged_in_filter(self):
        from sso_core.admin import HasLoggedInFilter, LocalUserAdmin
        from django.test import RequestFactory

        factory = RequestFactory()
        user_never = LocalUser.objects.create(username="neveruser", email="never@example.com")
        user_logged = LocalUser.objects.create(username="loggeduser", email="logged@example.com")

        log_login(None, "loggeduser", "manual", True)

        req_logged = factory.get('/admin/sso_core/localuser/', {'has_logged_in': 'logged_in'})
        filter_logged = HasLoggedInFilter(req_logged, req_logged.GET.copy(), LocalUser, LocalUserAdmin)
        qs_logged = filter_logged.queryset(req_logged, LocalUser.objects.all())

        req_never = factory.get('/admin/sso_core/localuser/', {'has_logged_in': 'never'})
        filter_never = HasLoggedInFilter(req_never, req_never.GET.copy(), LocalUser, LocalUserAdmin)
        qs_never = filter_never.queryset(req_never, LocalUser.objects.all())

        self.assertIn(user_logged, list(qs_logged))
        self.assertNotIn(user_never, list(qs_logged))

        self.assertIn(user_never, list(qs_never))
        self.assertNotIn(user_logged, list(qs_never))

