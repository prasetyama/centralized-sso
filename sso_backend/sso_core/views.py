import os
import jwt
import requests as py_requests
from datetime import datetime, timedelta

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings

from sso_core.models import User, Module
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

class MenuAccessMatrixView(BaseAuthenticatedView):
    def get(self, request):
        """
        Returns a matrix showing which roles have access to which menus within each module.
        
        Example Output:
        {
            "ERP": {
                "ORDER": {
                    "DASHBOARD": ["admin", "supervisor", "sales", "finance"],
                    "CREATE": ["admin", "supervisor", "sales"],
                    "APPROVAL": ["admin", "finance"],
                    "ADMIN": ["admin"]
                },
                "REPORT": {
                    "SALES": ["admin", "sales", "finance"],
                    "INVENTORY": ["admin"]
                }
            }
        }
        """
        try:
            payload = self.get_user_from_token(request)
            
            # Get all modules
            modules = Module.objects.filter(is_active=True)
            
            access_matrix = {}
            
            for module in modules:
                module_code = module.code
                access_matrix[module_code] = {}
                
                # Get all menus for this module
                menus = module.menus.filter(is_active=True)
                
                for menu in menus:
                    menu_code = menu.code
                    access_matrix[module_code][menu_code] = []
                    
                    # Get all roles that have access to this menu
                    roles = menu.roles.filter(is_active=True)
                    
                    for role in roles:
                        access_matrix[module_code][menu_code].append(role.key)
            
            return Response(access_matrix, status=status.HTTP_200_OK)
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)



