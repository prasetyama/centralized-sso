import os
import jwt
import requests as py_requests
from datetime import datetime, timedelta

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings

from sso_core.models import User, Module, RoleMenuPermission
from sso_core.serializers import UserSerializer, ModuleSerializer, GoogleLoginSerializer


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
            user = User.objects.filter(email=email, is_active=True).first()
            if not user:
                user = User.objects.create(
                    email=email,
                    first_name=idinfo.get('given_name', ''),
                    last_name=idinfo.get('family_name', ''),
                    google_uid=idinfo.get('sub', ''),
                    avatar_url=idinfo.get('picture', '')
                )
            
            # Issue JWT
            jwt_secret = os.getenv('JWT_SECRET')
            jwt_algorithm = os.getenv('JWT_ALGORITHM')
            access_token_lifetime = int(os.getenv('ACCESS_TOKEN_LIFETIME', '60'))
            
            payload = {
                "user_id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
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
            modules = Module.objects.filter(
                usermodulerole__user_id=user_id,
                usermodulerole__is_active=True,
                is_active=True
            ).distinct()
            
            serializer = ModuleSerializer(modules, many=True)
            return Response({"modules": serializer.data}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class VerifyPermissionView(BaseAuthenticatedView):
    """
    Verifies if a user has a specific permission action on a menu.
    """
    def get(self, request):
        try:
            payload = self.get_user_from_token(request)
            user_id = payload.get('user_id')
            
            module_code = request.query_params.get('module')
            menu_code = request.query_params.get('menu')
            permission_code = request.query_params.get('action')
            
            if not all([module_code, menu_code, permission_code]):
                return Response({
                    "error": "Missing required query parameters: module, menu, action"
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Check permission in DB
            has_perm = RoleMenuPermission.objects.filter(
                role__module_roles__user_id=user_id,
                role__module_roles__is_active=True,
                role__is_active=True,
                role__module__code=module_code,
                menu__code=menu_code,
                menu__is_active=True,
                permission__code=permission_code,
                permission__is_active=True,
                is_active=True
            ).exists()
            
            return Response({"has_permission": has_perm}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
