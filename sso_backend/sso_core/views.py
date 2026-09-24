import os
import jwt
import json
import logging
import requests as py_requests
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from pathlib import Path

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from django.db.models import Q

from sso_core.models import User, Module, ModuleMatrix, UserModuleRole, LocalUser, TitleMatrix
import bcrypt
from sso_core.serializers import UserSerializer, ModuleMatrixSerializer, GoogleLoginSerializer


# ─── File-based Login Logger Setup ─────────────────────────────────────────────
LOG_DIR = Path(settings.BASE_DIR) / 'logs'
LOG_DIR.mkdir(exist_ok=True)
LOGIN_LOG_FILE = LOG_DIR / 'login.jsonl'

_login_logger = logging.getLogger('login_audit')
_login_logger.setLevel(logging.INFO)
_login_logger.propagate = False

if not _login_logger.handlers:
    handler = RotatingFileHandler(
        str(LOGIN_LOG_FILE),
        maxBytes=10 * 1024 * 1024,  # 10 MB per file
        backupCount=5,              # Keep 5 rotated files
        encoding='utf-8',
    )
    handler.setFormatter(logging.Formatter('%(message)s'))
    _login_logger.addHandler(handler)


def get_client_ip(request):
    """Extract real client IP, considering reverse proxies."""
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def log_login(request, email, method, success, error_message=None):
    """Record a login attempt to the JSONL log file."""
    try:
        entry = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'email': email or 'unknown',
            'method': method,
            'status': 'success' if success else 'failed',
            'ip_address': get_client_ip(request),
            'user_agent': (request.META.get('HTTP_USER_AGENT', '') or '')[:500],
            'error': error_message,
        }
        _login_logger.info(json.dumps(entry, ensure_ascii=False))
    except Exception:
        pass  # Logging should never break the login flow


def _read_login_logs(email=None, limit=None):
    """Read login logs from the JSONL file, newest first. Optionally filter by email."""
    results = []
    try:
        if not LOGIN_LOG_FILE.exists():
            return results
        with open(LOGIN_LOG_FILE, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        # Read in reverse (newest first)
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                if email and entry.get('email', '').lower() != email.lower():
                    continue
                results.append(entry)
                if limit and len(results) >= limit:
                    break
            except json.JSONDecodeError:
                continue
    except Exception:
        pass
    return results


def get_last_login(email):
    """Get the most recent successful login timestamp for a user."""
    logs = _read_login_logs(email=email)
    for log in logs:
        if log.get('status') == 'success':
            return log.get('timestamp')
    return None


class BaseAuthenticatedView(APIView):
    """
    Base view to extract and decode JWT from Authorization header.
    In a real project, this would be a Custom Authentication class in DRF.
    """
    def get_user_from_token(self, request):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise Exception("Missing or invalid Authorization header")
        
        token = auth_header.split(' ')[1]
        jwt_secret = os.getenv('JWT_SECRET')
        jwt_algorithm = os.getenv('JWT_ALGORITHM')
        
        try:
            payload = jwt.decode(token, jwt_secret, algorithms=[jwt_algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            raise Exception("Token has expired")
        except jwt.InvalidTokenError:
            raise Exception("Invalid token")


class GoogleLoginView(APIView):
    """
    Validates Google Token, gets or creates User, and issues JWT.
    """
    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        token = serializer.validated_data['token']
        
        try:
            response = py_requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {token}'}
            )
            if not response.ok:
                raise ValueError(f"Invalid Google token: {response.text}")
            
            idinfo = response.json()
            email = idinfo.get('email')
            
            if not email:
                raise ValueError("Google token did not provide an email.")
            
            # Get or create User
            user = User.objects.filter(email=email, status=1).first()
            if not user:
                log_login(request, email, 'google', False, 'User not found')
                return Response({"error": "User not found"}, status=status.HTTP_401_UNAUTHORIZED)
            
            # Get last login BEFORE recording current one
            last_login = get_last_login(email)

            # Issue JWT
            jwt_secret = os.getenv('JWT_SECRET')
            jwt_algorithm = os.getenv('JWT_ALGORITHM')
            access_token_lifetime = int(os.getenv('ACCESS_TOKEN_LIFETIME', '60'))
            
            # Fetch module access from ModuleMatrix (external table)
            module_access = {}
            user_module_access = ModuleMatrix.objects.filter(email=email)
            if user_module_access:
                module_access = {item.module: item.operator for item in user_module_access}

            # Fetch module roles from UserModuleRole (viewer/editor per module)
            user_module_roles = UserModuleRole.objects.filter(
                user=user.email,
                module_code__is_active=True
            ).select_related('module_code')

            module_roles = {umr.module_code_id: umr.role for umr in user_module_roles}
            # result: {"eorder": "editor", "hrm": "viewer"}
            title_matrix = TitleMatrix.objects.filter(user=user.email).first()
            title = title_matrix.title_id if title_matrix else None

            payload = {
                "user_id": str(user.id),
                "email": user.email,
                "name": user.name,
                "department": user.department,
                "role": user.role,
                "image": user.image,
                "title": title,
                "module_access": module_access,
                "module_roles": module_roles,
                "exp": datetime.utcnow() + timedelta(minutes=access_token_lifetime),
                "iat": datetime.utcnow()
            }
            access_token = jwt.encode(payload, jwt_secret, algorithm=jwt_algorithm)
            
            user_data = UserSerializer(user).data

            # Log successful login
            log_login(request, email, 'google', True)
            
            return Response({
                "access_token": access_token,
                "user": user_data,
                "last_login": last_login,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            log_login(request, email if 'email' in dir() else 'unknown', 'google', False, str(e))
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class UserModulesView(BaseAuthenticatedView):
    """
    Returns modules the authenticated user is authorized to access.
    """
    def get(self, request):
        try:
            payload = self.get_user_from_token(request)
            user_id = payload.get('user_id')
            
            # Retrieve modules the user has access to based on UserModuleRole mapping
            modules = ModuleMatrix.objects.filter(
                email=payload.get('email')
            ).exclude(module__in=["STC", "STD", "STD FS", "STT NL", "STT NL FS", "STT RD", "STT RD FS", "STT SD", "STT SD FS"])
            
            serializer = ModuleMatrixSerializer(modules, many=True)
            return Response({"modules": serializer.data}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

class MenuAccessMatrixView(BaseAuthenticatedView):
    def get(self, request):
        """
        Returns the authenticated user's role per module.

        Example Output:
        {
            "eorder": "editor",
            "hrm": "viewer"
        }
        """
        try:
            payload = self.get_user_from_token(request)
            email = payload.get('email')

            user = User.objects.filter(email=email, status=1).first()
            if not user:
                return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

            user_module_roles = UserModuleRole.objects.filter(
                user=email,
                module_code__is_active=True
            ).select_related('module_code')

            result = {umr.module_code_id: umr.role for umr in user_module_roles}
            return Response(result, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class ImpersonateView(BaseAuthenticatedView):
    """
    ADMIN-only endpoint: generate a JWT token impersonating another user by email or username.
    The requesting user must have role='ADMIN' in their token payload.
    Supports looking up target user from both User (external User Matrix) and LocalUser models.
    """
    def post(self, request):
        try:
            payload = self.get_user_from_token(request)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        # Only ADMIN role can impersonate
        if str(payload.get('role', '')).upper() != 'ADMIN':
            return Response(
                {"error": "Permission denied. Only ADMIN users can impersonate."},
                status=status.HTTP_403_FORBIDDEN
            )

        target_identifier = (request.data.get('email') or request.data.get('username') or '').strip()
        if not target_identifier:
            return Response({"error": "email or username is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate target user exists (check User first, then LocalUser)
        target_user = User.objects.filter(email__iexact=target_identifier, status=1).first()
        is_local_user = False
        
        if not target_user:
            target_user = LocalUser.objects.filter(
                Q(email__iexact=target_identifier) | Q(username__iexact=target_identifier)
            ).first()
            if target_user:
                is_local_user = True

        if not target_user:
            return Response(
                {"error": f"No active user found with email/username: {target_identifier}"},
                status=status.HTTP_404_NOT_FOUND
            )

        if is_local_user:
            user_id = str(target_user.id)
            user_email = target_user.email or target_user.username
            user_username = target_user.username
            user_name = target_user.fname or target_user.username
            user_department = target_user.department
            user_role = target_user.role
            user_image = None
            identifiers = list(filter(None, set([target_user.username, target_user.email])))
        else:
            user_id = str(target_user.id)
            user_email = target_user.email
            user_username = getattr(target_user, 'username', target_user.email) or target_user.email
            user_name = target_user.name
            user_department = target_user.department
            user_role = target_user.role
            user_image = target_user.image
            identifiers = [target_user.email]

        jwt_secret = os.getenv('JWT_SECRET')
        jwt_algorithm = os.getenv('JWT_ALGORITHM')
        access_token_lifetime = int(os.getenv('ACCESS_TOKEN_LIFETIME', '60'))

        # Build module_access and module_roles for the target user
        module_access = {}
        user_module_access = ModuleMatrix.objects.filter(email__in=identifiers)
        if user_module_access:
            module_access = {item.module: item.operator for item in user_module_access}

        user_module_roles = UserModuleRole.objects.filter(
            user__in=identifiers,
            module_code__is_active=True
        ).select_related('module_code')

        module_roles = {umr.module_code_id: umr.role for umr in user_module_roles}

        title_matrix = TitleMatrix.objects.filter(user__in=identifiers).first()
        title = title_matrix.title_id if title_matrix else None

        impersonate_payload = {
            "user_id": user_id,
            "email": user_email,
            "username": user_username,
            "name": user_name,
            "department": user_department,
            "role": user_role,
            "image": user_image,
            "title": title,
            "module_access": module_access,
            "module_roles": module_roles,
            "impersonated_by": payload.get('email'),
            "exp": datetime.utcnow() + timedelta(minutes=access_token_lifetime),
            "iat": datetime.utcnow(),
        }

        access_token = jwt.encode(impersonate_payload, jwt_secret, algorithm=jwt_algorithm)

        # Log impersonation (logged under target email, with impersonated_by in context)
        log_login(request, user_email, 'impersonate', True,
                  f"Impersonated by {payload.get('email')}")

        return Response({
            "access_token": access_token,
            "user": {
                "id": user_id,
                "email": user_email,
                "username": user_username,
                "name": user_name,
                "department": user_department,
                "role": user_role,
                "image": user_image,
                "title": title,
            },
            "impersonated_by": payload.get('email'),
        }, status=status.HTTP_200_OK)

class ManualLoginView(APIView):
    """
    Validates Manual Login Token, gets User, and issues JWT.
    Supports authenticating via username or email.
    """
    def post(self, request):
        credential = request.data.get('username') or request.data.get('email')
        password = request.data.get('password')

        if not credential or not password:
            return Response({"error": "username/email and password are required."}, status=status.HTTP_400_BAD_REQUEST)

        local_user = LocalUser.objects.filter(
            Q(username__iexact=credential) | Q(email__iexact=credential)
        ).first()
        if not local_user:
            log_login(request, credential or 'unknown', 'manual', False, 'Invalid username or email')
            return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)
        
        if not local_user.check_password(password):
            log_login(request, credential, 'manual', False, 'Invalid password')
            return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)
        
        user_email = local_user.email or local_user.username

        # Get last login BEFORE recording current one
        last_login = get_last_login(user_email) or get_last_login(local_user.username)

        jwt_secret = os.getenv('JWT_SECRET')
        jwt_algorithm = os.getenv('JWT_ALGORITHM')
        access_token_lifetime = int(os.getenv('ACCESS_TOKEN_LIFETIME', '60'))
        
        # Gather possible user identifiers (both username and email) for matrix/role lookups
        identifiers = list(filter(None, set([local_user.username, local_user.email])))

        # Fetch module access from ModuleMatrix using user identifiers
        module_access = {}
        user_module_access = ModuleMatrix.objects.filter(email__in=identifiers)
        if user_module_access:
            module_access = {item.module: item.operator for item in user_module_access}

        # Fetch module roles from UserModuleRole using user identifiers
        user_module_roles = UserModuleRole.objects.filter(
            user__in=identifiers,
            module_code__is_active=True
        ).select_related('module_code')

        module_roles = {umr.module_code_id: umr.role for umr in user_module_roles}
        
        title_matrix = TitleMatrix.objects.filter(user__in=identifiers).first()
        title = title_matrix.title_id if title_matrix else None

        payload = {
            "user_id": str(local_user.id),
            "email": user_email,
            "username": local_user.username,
            "name": local_user.fname,
            "department": local_user.department,
            "role": local_user.role,
            "image": None,
            "title": title,
            "module_access": module_access,
            "module_roles": module_roles,
            "exp": datetime.utcnow() + timedelta(minutes=access_token_lifetime),
            "iat": datetime.utcnow()
        }
        access_token = jwt.encode(payload, jwt_secret, algorithm=jwt_algorithm)
        
        # Construct user_data directly to match UserSerializer fields
        user_data = {
            "id": str(local_user.id),
            "email": user_email,
            "username": local_user.username,
            "name": local_user.fname,
            "department": local_user.department,
            "role": local_user.role,
            "image": None
        }

        # Log successful login
        log_login(request, user_email, 'manual', True)
        
        return Response({
            "access_token": access_token,
            "user": user_data,
            "last_login": last_login,
        }, status=status.HTTP_200_OK)


class LoginHistoryView(BaseAuthenticatedView):
    """
    Returns login history for the authenticated user, including last_login.
    Reads from the JSONL log file.
    """
    def get(self, request):
        try:
            payload = self.get_user_from_token(request)
            email = payload.get('email')

            logs = _read_login_logs(email=email, limit=20)
            last_login = None
            for log in logs:
                if log.get('status') == 'success':
                    last_login = log.get('timestamp')
                    break

            return Response({
                "last_login": last_login,
                "history": [
                    {
                        "method": log.get('method'),
                        "status": log.get('status'),
                        "ip_address": log.get('ip_address'),
                        "user_agent": log.get('user_agent'),
                        "error_message": log.get('error'),
                        "timestamp": log.get('timestamp'),
                    }
                    for log in logs
                ]
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class UserDetailByIdView(BaseAuthenticatedView):
    """
    Search and return user details by ID from sso_db.users (LocalUser model) or User matrix.
    Supports GET /api/v1/users/<user_id>/ or GET /api/v1/users/?ids=1,2,3 or GET /api/v1/users/?id=1
    """
    def get(self, request, user_id=None):
        try:
            self.get_user_from_token(request)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        # Batch lookup via query param ?ids=1,2,3
        ids_param = request.query_params.get('ids')
        if ids_param:
            id_list = [i.strip() for i in ids_param.split(',') if i.strip()]
            local_users = LocalUser.objects.filter(id__in=id_list)
            users_map = {}
            for u in local_users:
                users_map[str(u.id)] = {
                    "id": u.id,
                    "username": u.username,
                    "name": u.fname or u.username,
                    "department": u.department,
                    "region": u.region,
                    "role": u.role,
                }

            # Check remaining missing IDs in User matrix
            missing_ids = [i for i in id_list if i not in users_map]
            if missing_ids:
                matrix_users = User.objects.filter(id__in=missing_ids)
                for mu in matrix_users:
                    users_map[str(mu.id)] = {
                        "id": mu.id,
                        "username": mu.email,
                        "name": mu.name,
                        "department": mu.department,
                        "region": None,
                        "role": mu.role,
                    }

            return Response({"users": users_map}, status=status.HTTP_200_OK)

        # Single lookup by user_id from path or query param ?id=...
        target_id = user_id or request.query_params.get('id')
        if not target_id:
            return Response({"error": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Primary lookup: LocalUser (table sso_db.users)
        local_user = LocalUser.objects.filter(id=target_id).first()
        if local_user:
            return Response({
                "id": local_user.id,
                "username": local_user.username,
                "name": local_user.fname or local_user.username,
                "department": local_user.department,
                "region": local_user.region,
                "role": local_user.role,
            }, status=status.HTTP_200_OK)

        # Secondary lookup: User (table User Matrix)
        matrix_user = User.objects.filter(id=target_id).first()
        if matrix_user:
            return Response({
                "id": matrix_user.id,
                "username": matrix_user.email,
                "name": matrix_user.name,
                "department": matrix_user.department,
                "region": None,
                "role": matrix_user.role,
            }, status=status.HTTP_200_OK)

        return Response({"error": f"User with id '{target_id}' not found."}, status=status.HTTP_404_NOT_FOUND)


class ChangePasswordView(BaseAuthenticatedView):
    """
    Endpoint for authenticated user to update their password.
    Requires: old_password, new_password, confirm_password.
    """
    def post(self, request):
        try:
            payload = self.get_user_from_token(request)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')

        if not old_password or not new_password or not confirm_password:
            return Response(
                {"error": "Semua field (password lama, password baru, dan konfirmasi password) wajib diisi."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_password != confirm_password:
            return Response(
                {"error": "Password baru dan konfirmasi password baru tidak cocok."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(new_password) < 6:
            return Response(
                {"error": "Password baru minimal 6 karakter."},
                status=status.HTTP_400_BAD_REQUEST
            )

        username = payload.get('username')
        email = payload.get('email')
        user_id = payload.get('user_id')

        local_user = None
        if username:
            local_user = LocalUser.objects.filter(username__iexact=username).first()
        if not local_user and email:
            local_user = LocalUser.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).first()
        if not local_user and user_id:
            try:
                local_user = LocalUser.objects.filter(id=int(user_id)).first()
            except (ValueError, TypeError):
                pass

        if not local_user:
            return Response(
                {"error": "Akun pengguna lokal tidak ditemukan."},
                status=status.HTTP_404_NOT_FOUND
            )

        if not local_user.check_password(old_password):
            return Response(
                {"error": "Password lama tidak sesuai."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Hash and save new password
        local_user.set_password(new_password)
        local_user.save()

        return Response(
            {"message": "Password berhasil diperbarui."},
            status=status.HTTP_200_OK
        )


