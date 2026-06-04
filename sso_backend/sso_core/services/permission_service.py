from sso_core.repositories.role_repository import RoleRepository

class PermissionService:
    @staticmethod
    def verify_permission(user_id: str, module_code: str, menu_code: str, permission_code: str) -> bool:
        """
        Evaluates whether a user has a specific permission action on a specific menu.
        """
        return RoleRepository.check_user_menu_permission(
            user_id=user_id,
            module_code=module_code,
            menu_code=menu_code,
            permission_code=permission_code
        )
