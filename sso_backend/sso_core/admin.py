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
    list_display = ('key', 'name', 'module__name', 'is_active')
    list_filter = ('module__name', 'is_active')
    search_fields = ('key', 'name', 'module__name')
    ordering = ('module__name', 'key')

@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'module__name', 'is_active')
    list_filter = ('module__name', 'is_active')
    search_fields = ('code', 'name', 'module__name')
    ordering = ('module__name', 'code')


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('code', 'name')
    search_fields = ('code', 'name')
    ordering = ('code',)

@admin.register(RoleMenuPermission)
class RoleMenuPermissionAdmin(admin.ModelAdmin):
    list_display = ('role__key', 'menu__code', 'permission__code')
    list_filter = ('role__key', 'menu__code', 'permission__code')
    search_fields = ('role__key', 'menu__code', 'permission__code')

@admin.register(UserModuleRole)
class UserModuleRoleAdmin(admin.ModelAdmin):
    list_display = ('user__email', 'module__name', 'role__key')
    list_filter = ('user__email', 'module__name', 'role__key')
    search_fields = ('user__email', 'module__name', 'role__key')