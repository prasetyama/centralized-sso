from django.urls import path
from sso_core.views import GoogleLoginView, UserModulesView, MenuAccessMatrixView, ImpersonateView

urlpatterns = [
    path('auth/google/', GoogleLoginView.as_view(), name='google-login'),
    path('auth/impersonate/', ImpersonateView.as_view(), name='impersonate'),
    path('user/modules/', UserModulesView.as_view(), name='user-modules'),
    path('user/menu-access/', MenuAccessMatrixView.as_view(), name='user-menu-access'),
]
