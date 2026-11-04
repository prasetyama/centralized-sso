from django.urls import path
from sso_core.views import GoogleLoginView, UserModulesView, MenuAccessMatrixView, ImpersonateView, ManualLoginView, LoginHistoryView, UserDetailByIdView, ChangePasswordView
from sso_core.eorder_user_views import (
    EOrderUserListView,
    EOrderUserImportView,
    EOrderUserDetailView,
    EOrderUserDistributorsView,
    EOrderImportLogsView,
    EOrderUserExportView,
    EOrderUserStatsView
)
from sso_core.std_area_matrix_views import (
    StdAreaMatrixListView,
    StdAreaMatrixOptionsView,
    StdAreaMatrixUserMappingView,
    StdAreaMatrixRowView,
    StdAreaMatrixExportView
)

urlpatterns = [
    path('auth/google/', GoogleLoginView.as_view(), name='google-login'),
    path('auth/manual/', ManualLoginView.as_view(), name='manual-login'),
    path('auth/impersonate/', ImpersonateView.as_view(), name='impersonate'),
    path('user/modules/', UserModulesView.as_view(), name='user-modules'),
    path('user/menu-access/', MenuAccessMatrixView.as_view(), name='user-menu-access'),
    path('user/login-history/', LoginHistoryView.as_view(), name='login-history'),
    path('user/change-password/', ChangePasswordView.as_view(), name='user-change-password'),
    path('users/', UserDetailByIdView.as_view(), name='user-list-by-ids'),
    path('users/<str:user_id>/', UserDetailByIdView.as_view(), name='user-detail-by-id'),

    # EORDERWEB User Management Routes
    path('eorder-users/', EOrderUserListView.as_view(), name='eorder-user-list'),
    path('eorder-users/export-excel/', EOrderUserExportView.as_view(), name='eorder-user-export-excel'),
    path('eorder-users/stats/', EOrderUserStatsView.as_view(), name='eorder-user-stats'),
    path('eorder-users/import-csv/', EOrderUserImportView.as_view(), name='eorder-user-import-csv'),
    path('eorder-users/create/', EOrderUserDetailView.as_view(), name='eorder-user-create'),
    path('eorder-users/<int:user_id>/', EOrderUserDetailView.as_view(), name='eorder-user-detail'),
    path('eorder-users/distributors/', EOrderUserDistributorsView.as_view(), name='eorder-user-distributors'),
    path('eorder-users/logs/', EOrderImportLogsView.as_view(), name='eorder-import-logs'),
    path('eorder-users/logs/<str:filename>/', EOrderImportLogsView.as_view(), name='eorder-import-log-detail'),

    # STD Area Matrix Management Routes (RSM & ASM Distributor Mapping)
    path('std-area-matrix/', StdAreaMatrixListView.as_view(), name='std-area-matrix-list'),
    path('std-area-matrix/options/', StdAreaMatrixOptionsView.as_view(), name='std-area-matrix-options'),
    path('std-area-matrix/user-mapping/', StdAreaMatrixUserMappingView.as_view(), name='std-area-matrix-user-mapping'),
    path('std-area-matrix/rows/', StdAreaMatrixRowView.as_view(), name='std-area-matrix-row-create'),
    path('std-area-matrix/rows/<int:row_id>/', StdAreaMatrixRowView.as_view(), name='std-area-matrix-row-detail'),
    path('std-area-matrix/export-excel/', StdAreaMatrixExportView.as_view(), name='std-area-matrix-export-excel'),
]

