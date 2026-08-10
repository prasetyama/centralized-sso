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
    ADMIN-only endpoint: generate a JWT token impersonating another user by email.
    The requesting user must have role='ADMIN' in their token payload.
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

        target_email = request.data.get('email', '').strip().lower()
        if not target_email:
            return Response({"error": "email is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate the target user exists and is active
        target_user = User.objects.filter(email__iexact=target_email, status=1).first()
        if not target_user:
            return Response(
                {"error": f"No active user found with email: {target_email}"},
                status=status.HTTP_404_NOT_FOUND
            )

        jwt_secret = os.getenv('JWT_SECRET')
        jwt_algorithm = os.getenv('JWT_ALGORITHM')
        access_token_lifetime = int(os.getenv('ACCESS_TOKEN_LIFETIME', '60'))

        # Build module_access and module_roles for the target user
        module_access = {}
        user_module_access = ModuleMatrix.objects.filter(email__iexact=target_email)
        if user_module_access:
            module_access = {item.module: item.operator for item in user_module_access}

        user_module_roles = UserModuleRole.objects.filter(
            user=target_user.email,
            module_code__is_active=True
        ).select_related('module_code')

        module_roles = {umr.module_code_id: umr.role for umr in user_module_roles}

        title_matrix = TitleMatrix.objects.filter(user=target_user.email).first()
        title = title_matrix.title_id if title_matrix else None

        impersonate_payload = {
            "user_id": str(target_user.id),
            "email": target_user.email,
            "name": target_user.name,
            "department": target_user.department,
            "role": target_user.role,
            "image": target_user.image,
            "title": title,
            "module_access": module_access,
            "module_roles": module_roles,
            "impersonated_by": payload.get('email'),
            "exp": datetime.utcnow() + timedelta(minutes=access_token_lifetime),
            "iat": datetime.utcnow(),
        }

        access_token = jwt.encode(impersonate_payload, jwt_secret, algorithm=jwt_algorithm)

        # Log impersonation (logged under target email, with impersonated_by in context)
        log_login(request, target_email, 'impersonate', True,
                  f"Impersonated by {payload.get('email')}")

        return Response({
            "access_token": access_token,
            "user": {
                "id": str(target_user.id),
                "email": target_user.email,
                "name": target_user.name,
                "department": target_user.department,
                "role": target_user.role,
                "image": target_user.image,
                "title": title,
            },
            "impersonated_by": payload.get('email'),
        }, status=status.HTTP_200_OK)

class ManualLoginView(APIView):
    """
    Validates Manual Login Token, gets User, and issues JWT.
    """
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({"error": "username and password are required."}, status=status.HTTP_400_BAD_REQUEST)

        local_user = LocalUser.objects.filter(username__iexact=username).first()
        if not local_user:
            log_login(request, username or 'unknown', 'manual', False, 'Invalid username')
            return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)
        
        if not bcrypt.checkpw(password.encode('utf-8'), local_user.password.encode('utf-8')):
            log_login(request, username, 'manual', False, 'Invalid password')
            return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)
        
        # Get last login BEFORE recording current one
        last_login = get_last_login(local_user.username)

        jwt_secret = os.getenv('JWT_SECRET')
        jwt_algorithm = os.getenv('JWT_ALGORITHM')
        access_token_lifetime = int(os.getenv('ACCESS_TOKEN_LIFETIME', '60'))
        
        # Fetch module access from ModuleMatrix using local_user.username
        module_access = {}
        user_module_access = ModuleMatrix.objects.filter(email=local_user.username)
        if user_module_access:
            module_access = {item.module: item.operator for item in user_module_access}

        # Fetch module roles from UserModuleRole using local_user.username
        user_module_roles = UserModuleRole.objects.filter(
            user=local_user.username,
            module_code__is_active=True
        ).select_related('module_code')

        module_roles = {umr.module_code_id: umr.role for umr in user_module_roles}
        
        title_matrix = TitleMatrix.objects.filter(user=local_user.username).first()
        title = title_matrix.title_id if title_matrix else None

        payload = {
            "user_id": str(local_user.id),
            "email": local_user.username,
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
            "email": local_user.username,
            "name": local_user.fname,
            "department": local_user.department,
            "role": local_user.role,
            "image": None
        }

        # Log successful login
        log_login(request, local_user.username, 'manual', True)
        
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
