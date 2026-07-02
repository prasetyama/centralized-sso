from django import forms
from django.contrib import admin
from .models import User, Module, UserModuleRole, ModuleMatrix, Role, TitleMatrix, LocalUser

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
    list_display = ('name', 'code', 'description')
    list_filter = ('code',)
    search_fields = ('name', 'code')
    ordering = ('code',)

class TitleMatrixForm(forms.ModelForm):
    user = forms.ChoiceField(choices=[], required=True, label="User (Email/Username)")

    class Meta:
        model = TitleMatrix
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user_choices = []
        try:
            # SSO Users
            for u in User.objects.all():
                user_choices.append((u.email, f"{u.name} ({u.email}) [SSO]"))
            # Local Users
            for lu in LocalUser.objects.all():
                user_choices.append((lu.username, f"{lu.fname or 'No Name'} ({lu.username}) [Local]"))
            
            user_choices.sort(key=lambda x: str(x[1]).lower())
        except Exception:
            pass # Handle DB not ready yet
            
        user_choices.insert(0, ('', '---------'))
        self.fields['user'].choices = user_choices

@admin.register(TitleMatrix)
class TitleMatrixAdmin(admin.ModelAdmin):
    form = TitleMatrixForm
    list_display = ('user', 'dept', 'title')
    list_filter = ('dept', 'title', 'user')
    search_fields = ('user', 'dept', 'title')
    ordering = ('user',)

class ModuleMatrixForm(forms.ModelForm):
    email = forms.ChoiceField(choices=[], required=True, label="User (Email/Username)")

    class Meta:
        model = ModuleMatrix
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user_choices = []
        try:
            # SSO Users
            for u in User.objects.all():
                user_choices.append((u.email, f"{u.name} ({u.email}) [SSO]"))
            # Local Users
            for lu in LocalUser.objects.all():
                user_choices.append((lu.username, f"{lu.fname or 'No Name'} ({lu.username}) [Local]"))
            
            user_choices.sort(key=lambda x: str(x[1]).lower())
        except Exception:
            pass # Handle DB not ready yet
            
        user_choices.insert(0, ('', '---------'))
        self.fields['email'].choices = user_choices

@admin.register(ModuleMatrix)
class ModuleMatrixAdmin(admin.ModelAdmin):
    form = ModuleMatrixForm
    list_display = ('email', 'module', 'operator')
    list_filter = ('email',)
    search_fields = ('email', 'module')
    ordering = ('email',)

@admin.register(UserModuleRole)
class UserModuleRoleAdmin(admin.ModelAdmin):
    list_display = ('user_email', 'module_name', 'role')
    list_filter = ('role', 'module_code')
    search_fields = ('user__email', 'module_code__name', 'module_code__code')
    ordering = ('user__email', 'module_code__code')

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = 'User Email'

    def module_name(self, obj):
        return f"{obj.module_code.name} ({obj.module_code.code})"
    module_name.short_description = 'Module'

@admin.register(LocalUser)
class LocalUserAdmin(admin.ModelAdmin):
    list_display = ('username', 'fname', 'role', 'department')
    list_filter = ('role', 'department')
    search_fields = ('username', 'fname')
