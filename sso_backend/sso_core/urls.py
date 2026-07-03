from django.urls import path
from sso_core.views import GoogleLoginView, UserModulesView, MenuAccessMatrixView, ImpersonateView, ManualLoginView, LoginHistoryView

urlpatterns = [
    path('auth/google/', GoogleLoginView.as_view(), name='google-login'),
    path('auth/manual/', ManualLoginView.as_view(), name='manual-login'),
    path('auth/impersonate/', ImpersonateView.as_view(), name='impersonate'),
    path('user/modules/', UserModulesView.as_view(), name='user-modules'),
    path('user/menu-access/', MenuAccessMatrixView.as_view(), name='user-menu-access'),
    path('user/login-history/', LoginHistoryView.as_view(), name='login-history'),
]
