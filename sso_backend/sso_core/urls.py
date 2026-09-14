from django.urls import path
from sso_core.views import GoogleLoginView, UserModulesView, MenuAccessMatrixView, ImpersonateView, ManualLoginView, LoginHistoryView, UserDetailByIdView
from sso_core.eorder_user_views import (
    EOrderUserListView,
    EOrderUserImportView,
    EOrderUserDetailView,
    EOrderUserDistributorsView,
    EOrderImportLogsView
)

urlpatterns = [
    path('auth/google/', GoogleLoginView.as_view(), name='google-login'),
    path('auth/manual/', ManualLoginView.as_view(), name='manual-login'),
    path('auth/impersonate/', ImpersonateView.as_view(), name='impersonate'),
    path('user/modules/', UserModulesView.as_view(), name='user-modules'),
    path('user/menu-access/', MenuAccessMatrixView.as_view(), name='user-menu-access'),
    path('user/login-history/', LoginHistoryView.as_view(), name='login-history'),
    path('users/', UserDetailByIdView.as_view(), name='user-list-by-ids'),
    path('users/<str:user_id>/', UserDetailByIdView.as_view(), name='user-detail-by-id'),

    # EORDERWEB User Management Routes
    path('eorder-users/', EOrderUserListView.as_view(), name='eorder-user-list'),
    path('eorder-users/import-csv/', EOrderUserImportView.as_view(), name='eorder-user-import-csv'),
    path('eorder-users/create/', EOrderUserDetailView.as_view(), name='eorder-user-create'),
    path('eorder-users/<int:user_id>/', EOrderUserDetailView.as_view(), name='eorder-user-detail'),
    path('eorder-users/distributors/', EOrderUserDistributorsView.as_view(), name='eorder-user-distributors'),
    path('eorder-users/logs/', EOrderImportLogsView.as_view(), name='eorder-import-logs'),
    path('eorder-users/logs/<str:filename>/', EOrderImportLogsView.as_view(), name='eorder-import-log-detail'),
]
