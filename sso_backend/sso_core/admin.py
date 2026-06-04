from django.contrib import admin
from .models import User, Module, Role, Menu, Permission, RoleMenuPermission, UserModuleRole

# Register your models here.
admin.site.register(User)
admin.site.register(Module)
admin.site.register(Role)
admin.site.register(Menu)
admin.site.register(Permission)
admin.site.register(RoleMenuPermission)
admin.site.register(UserModuleRole)