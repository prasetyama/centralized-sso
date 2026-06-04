from django.urls import path
from sso_core.views import GoogleLoginView, UserModulesView, VerifyPermissionView

urlpatterns = [
    path('auth/google/', GoogleLoginView.as_view(), name='google-login'),
    path('user/modules/', UserModulesView.as_view(), name='user-modules'),
    path('auth/verify-permission/', VerifyPermissionView.as_view(), name='verify-permission'),
]
