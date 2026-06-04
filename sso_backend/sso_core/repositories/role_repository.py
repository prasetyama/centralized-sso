from typing import List, Dict, Any
from sso_core.models import UserModuleRole, RoleMenuPermission, Module

class RoleRepository:
    @staticmethod
    def get_user_authorized_modules(user_id: str) -> List[Dict[str, Any]]:
        # Get modules the user has access to based on UserModuleRole mapping
        modules = Module.objects.filter(
            usermodulerole__user_id=user_id,
            usermodulerole__is_active=True,
            is_active=True
        ).distinct()
        
        return [
            {
                "code": mod.code,
                "name": mod.name,
                "description": mod.description,
                "redirect_url": mod.redirect_url
            } for mod in modules
        ]

    @staticmethod
    def check_user_menu_permission(user_id: str, module_code: str, menu_code: str, permission_code: str) -> bool:
        # Check if user has a specific action permission on a specific menu within a module
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
        return has_perm
