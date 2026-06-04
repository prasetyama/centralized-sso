from django.contrib import admin
from .models import User, Module, Role, Menu, Permission, RoleMenuPermission, UserModuleRole

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('google_uid', 'email', 'first_name', 'last_name', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('google_uid', 'email', 'first_name', 'last_name')
    ordering = ('google_uid',)

@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('code', 'name')
    ordering = ('code',)

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('key', 'name', 'module', 'is_active')
    list_filter = ('module', 'is_active')
    search_fields = ('key', 'name')
    ordering = ('module', 'key')

@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'module__name', 'is_active')
    list_filter = ('module', 'is_active')
    search_fields = ('code', 'name', 'module__name')
    ordering = ('module', 'code')


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('code', 'name')
    search_fields = ('code', 'name')
    ordering = ('code',)

@admin.register(RoleMenuPermission)
class RoleMenuPermissionAdmin(admin.ModelAdmin):
    list_display = ('role', 'menu', 'permission')
    list_filter = ('role', 'menu', 'permission')
    search_fields = ('role__key', 'menu__code', 'permission__code')

@admin.register(UserModuleRole)
class UserModuleRoleAdmin(admin.ModelAdmin):
    list_display = ('user', 'module', 'role')
    list_filter = ('user', 'module', 'role')
    search_fields = ('user__email', 'module__code', 'role__key')