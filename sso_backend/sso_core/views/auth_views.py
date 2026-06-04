from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from sso_core.services.auth_service import AuthService
from sso_core.services.permission_service import PermissionService

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
        payload = AuthService.decode_jwt(token)
        return payload

class GoogleLoginView(APIView):
    def post(self, request):
        token = request.data.get('token')
        print(token)
        if not token:
            return Response({"error": "Token is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = AuthService.verify_google_token_and_login(token)
            print(result)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

class UserModulesView(BaseAuthenticatedView):
    def get(self, request):
        try:
            payload = self.get_user_from_token(request)
            user_id = payload.get('user_id')
            modules = AuthService.get_authorized_modules(user_id)
            return Response({"modules": modules}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

class VerifyPermissionView(BaseAuthenticatedView):
    def get(self, request):
        try:
            payload = self.get_user_from_token(request)
            user_id = payload.get('user_id')
            
            module_code = request.query_params.get('module')
            menu_code = request.query_params.get('menu')
            permission_code = request.query_params.get('action')
            
            if not all([module_code, menu_code, permission_code]):
                return Response({"error": "Missing required query parameters: module, menu, action"}, status=status.HTTP_400_BAD_REQUEST)

            has_permission = PermissionService.verify_permission(user_id, module_code, menu_code, permission_code)
            
            return Response({"has_permission": has_permission}, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
