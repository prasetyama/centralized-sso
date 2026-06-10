from django.contrib import admin
from .models import User, Module, UserModuleRole

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

@admin.register(UserModuleRole)
class UserModuleRoleAdmin(admin.ModelAdmin):
    list_display = ('user_email', 'module_name', 'role', 'is_active')
    list_filter = ('role', 'is_active', 'module_code')
    search_fields = ('user__email', 'module_code__name', 'module_code__code')
    ordering = ('user__email', 'module_code__code')

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = 'User Email'

    def module_name(self, obj):
        return f"{obj.module_code.name} ({obj.module_code.code})"
    module_name.short_description = 'Module'