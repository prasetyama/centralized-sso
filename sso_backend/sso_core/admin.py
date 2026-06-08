from django.contrib import admin
from .models import User, Module, Role, Menu, UserModuleRole

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'department', 'role', 'status')
    list_filter = ('status',)
    search_fields = ('email', 'name', 'department', 'role', 'status')
    ordering = ('email',)

@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('code', 'name')
    ordering = ('code',)

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('key', 'name', 'menu__name', 'is_active')
    list_filter = ('menu__name', 'is_active')
    search_fields = ('key', 'name', 'menu__name')
    ordering = ('menu__name', 'key')

@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'module__name', 'is_active')
    list_filter = ('module__name', 'is_active')
    search_fields = ('code', 'name', 'module__name')
    ordering = ('module__name', 'code')


@admin.register(UserModuleRole)
class UserModuleRoleAdmin(admin.ModelAdmin):
    list_display = ('user__email', 'module__name', 'role__key', 'is_active')
    list_filter = ('user__email', 'module__name', 'role__key')
    search_fields = ('user__email', 'module__name', 'role__key')