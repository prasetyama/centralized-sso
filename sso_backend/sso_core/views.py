import os
import jwt
import requests as py_requests
from datetime import datetime, timedelta

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings

from sso_core.models import User, Module, ModuleMatrix, UserModuleRole
from sso_core.serializers import UserSerializer, ModuleMatrixSerializer, GoogleLoginSerializer


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
                # user = User.objects.create(
                #     email=email,
                #     name=idinfo.get('given_name', '') + ' ' + idinfo.get('family_name', ''),
                #     department=idinfo.get('department', ''),
                #     role=idinfo.get('role', ''),
                #     image=idinfo.get('picture', ''),
                #     status=1
                # )

                return Response({"error": "User not found"}, status=status.HTTP_401_UNAUTHORIZED)
            
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
            user_module_roles = user.module_roles.filter(
                module_code__is_active=True
            ).select_related('module_code')

            module_roles = {umr.module_code_id: umr.role for umr in user_module_roles}
            # result: {"eorder": "editor", "hrm": "viewer"}

            payload = {
                "user_id": str(user.id),
                "email": user.email,
                "name": user.name,
                "department": user.department,
                "role": user.role,
                "image": user.image,
                "module_access": module_access,
                "module_roles": module_roles,
                "exp": datetime.utcnow() + timedelta(minutes=access_token_lifetime),
                "iat": datetime.utcnow()
            }
            access_token = jwt.encode(payload, jwt_secret, algorithm=jwt_algorithm)
            
            user_data = UserSerializer(user).data
            
            return Response({
                "access_token": access_token,
                "user": user_data
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
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
            )
            
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

            user_module_roles = user.module_roles.filter(
                is_active=True,
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

        user_module_roles = target_user.module_roles.filter(
            module_code__is_active=True
        ).select_related('module_code')

        module_roles = {umr.module_code_id: umr.role for umr in user_module_roles}

        impersonate_payload = {
            "user_id": str(target_user.id),
            "email": target_user.email,
            "name": target_user.name,
            "department": target_user.department,
            "role": target_user.role,
            "image": target_user.image,
            "module_access": module_access,
            "module_roles": module_roles,
            "impersonated_by": payload.get('email'),  # audit trail
            "exp": datetime.utcnow() + timedelta(minutes=access_token_lifetime),
            "iat": datetime.utcnow(),
        }

        access_token = jwt.encode(impersonate_payload, jwt_secret, algorithm=jwt_algorithm)

        return Response({
            "access_token": access_token,
            "user": {
                "id": str(target_user.id),
                "email": target_user.email,
                "name": target_user.name,
                "department": target_user.department,
                "role": target_user.role,
                "image": target_user.image,
            },
            "impersonated_by": payload.get('email'),
        }, status=status.HTTP_200_OK)
