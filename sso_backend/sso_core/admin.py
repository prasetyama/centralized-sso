from django import forms
from django.contrib import admin
from django.template.response import TemplateResponse
from django.urls import path
from django.utils.html import format_html
from django.utils.dateparse import parse_datetime
from django.db.models import Q
from .models import User, Module, UserModuleRole, ModuleMatrix, Role, TitleMatrix, LocalUser, LoginLog


class HasLoggedInFilter(admin.SimpleListFilter):
    title = 'Status Login'
    parameter_name = 'has_logged_in'

    def lookups(self, request, model_admin):
        return (
            ('logged_in', 'Sudah Login'),
            ('never', 'Belum Pernah Login'),
        )

    def queryset(self, request, queryset):
        val = self.value()
        if not val:
            return queryset
        
        clean_ids = set()
        # 1. Fetch from LoginLog DB table (if table exists)
        try:
            db_emails = LoginLog.objects.filter(status='success').values_list('email', flat=True).distinct()
            for e in db_emails:
                if e and str(e).strip() and str(e).strip().lower() != 'unknown':
                    s = str(e).strip()
                    clean_ids.add(s)
                    clean_ids.add(s.lower())
                    clean_ids.add(s.upper())
        except Exception:
            pass

        # 2. Fetch from JSONL file logs (independent try block)
        try:
            all_file_logs = _read_all_logs()
            for log in all_file_logs:
                if log.get('status') == 'success' and log.get('email'):
                    s = str(log['email']).strip()
                    if s and s.lower() != 'unknown':
                        clean_ids.add(s)
                        clean_ids.add(s.lower())
                        clean_ids.add(s.upper())
        except Exception:
            pass

        if not clean_ids:
            if val == 'logged_in':
                return queryset.none()
            return queryset

        is_user_matrix = (queryset.model.__name__ == 'User')

        if val == 'logged_in':
            if is_user_matrix:
                return queryset.filter(email__in=clean_ids).distinct()
            else:
                return queryset.filter(Q(email__in=clean_ids) | Q(username__in=clean_ids)).distinct()
        elif val == 'never':
            if is_user_matrix:
                return queryset.exclude(email__in=clean_ids).distinct()
            else:
                return queryset.exclude(Q(email__in=clean_ids) | Q(username__in=clean_ids)).distinct()

        return queryset


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'department', 'role', 'status', 'last_login_display')
    list_filter = ('status', HasLoggedInFilter)
    search_fields = ('email', 'name', 'department', 'role', 'status')
    ordering = ('email',)

    def last_login_display(self, obj):
        val = obj.last_login
        if not val:
            return format_html('<span style="color: #dc2626; font-weight: bold; background-color: #fee2e2; padding: 2px 8px; border-radius: 4px;">{}</span>', 'Belum Login')
        try:
            dt = parse_datetime(val) if isinstance(val, str) else val
            formatted = dt.strftime('%Y-%m-%d %H:%M') if dt else val
            return format_html('<span style="color: #16a34a; font-weight: 600;">{}</span>', formatted)
        except Exception:
            return val
    last_login_display.short_description = 'Last Login'

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

class UserModuleRoleForm(forms.ModelForm):
    user = forms.ChoiceField(choices=[], required=True, label="User (Email/Username)")

    class Meta:
        model = UserModuleRole
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

@admin.register(UserModuleRole)
class UserModuleRoleAdmin(admin.ModelAdmin):
    form = UserModuleRoleForm
    list_display = ('user', 'module_name', 'role')
    list_filter = ('role', 'module_code')
    search_fields = ('user', 'module_code__name', 'module_code__code')
    ordering = ('user', 'module_code__code')

    def module_name(self, obj):
        return f"{obj.module_code.name} ({obj.module_code.code})"
    module_name.short_description = 'Module'

class LocalUserForm(forms.ModelForm):
    password = forms.CharField(
        widget=forms.PasswordInput(render_value=False),
        required=False,
        help_text="Leave blank to keep existing password intact."
    )

    class Meta:
        model = LocalUser
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not self.instance or not self.instance.pk:
            self.fields['password'].required = True
            self.fields['password'].help_text = "Required. Password will be hashed using bcrypt."

    def clean_password(self):
        password = self.cleaned_data.get('password')
        if (not self.instance or not self.instance.pk) and not password:
            raise forms.ValidationError("Password is required for new users.")
        return password

    def save(self, commit=True):
        user = super().save(commit=False)
        password = self.cleaned_data.get('password')
        if password:
            user.set_password(password)
        elif self.instance and self.instance.pk:
            orig_user = LocalUser.objects.filter(pk=self.instance.pk).first()
            if orig_user:
                user.password = orig_user.password
        if commit:
            user.save()
        return user


@admin.register(LocalUser)
class LocalUserAdmin(admin.ModelAdmin):
    form = LocalUserForm
    list_display = ('username', 'fname', 'role', 'department', 'last_login_display')
    list_filter = ('role', 'department', HasLoggedInFilter)
    search_fields = ('username', 'fname')

    def last_login_display(self, obj):
        val = obj.last_login
        if not val:
            return format_html('<span style="color: #dc2626; font-weight: bold; background-color: #fee2e2; padding: 2px 8px; border-radius: 4px;">{}</span>', 'Belum Login')
        try:
            dt = parse_datetime(val) if isinstance(val, str) else val
            formatted = dt.strftime('%Y-%m-%d %H:%M') if dt else val
            return format_html('<span style="color: #16a34a; font-weight: 600;">{}</span>', formatted)
        except Exception:
            return val
    last_login_display.short_description = 'Last Login'



# ─── Custom Admin View: Login Logs (file-based) ───────────────────────────────
import json
from pathlib import Path
from django.conf import settings

LOGIN_LOG_FILE = Path(settings.BASE_DIR) / 'logs' / 'login.jsonl'


from django.utils.dateparse import parse_datetime

def _read_all_logs():
    """Read all login logs from the JSONL file, newest first."""
    results = []
    try:
        if not LOGIN_LOG_FILE.exists():
            return results
        with open(LOGIN_LOG_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if 'timestamp' in entry and isinstance(entry['timestamp'], str):
                        dt = parse_datetime(entry['timestamp'])
                        if dt:
                            entry['timestamp_obj'] = dt
                    results.append(entry)
                except json.JSONDecodeError:
                    continue
    except Exception:
        pass
    results.reverse()  # newest first
    return results


class SSOAdminSite(admin.AdminSite):
    """Extended admin site with custom login log view."""
    pass


# Register the custom view on the default admin site
_original_get_urls = admin.site.get_urls

def get_urls():
    custom_urls = [
        path('login-logs/', admin.site.admin_view(login_logs_view), name='login-logs'),
    ]
    return custom_urls + _original_get_urls()

admin.site.get_urls = get_urls


def login_logs_view(request):
    """Custom admin view to display login logs from JSONL file."""
    logs = _read_all_logs()

    # Search filter
    search = request.GET.get('q', '').strip().lower()
    if search:
        logs = [
            log for log in logs
            if search in log.get('email', '').lower()
            or search in (log.get('ip_address') or '').lower()
        ]

    # Method filter
    method_filter = request.GET.get('method', '').strip()
    if method_filter:
        logs = [log for log in logs if log.get('method') == method_filter]

    # Status filter
    status_filter = request.GET.get('status', '').strip()
    if status_filter:
        logs = [log for log in logs if log.get('status') == status_filter]

    # Pagination
    per_page = 50
    page = int(request.GET.get('p', 0))
    total = len(logs)
    start = page * per_page
    end = start + per_page
    page_logs = logs[start:end]
    total_pages = (total + per_page - 1) // per_page

    context = {
        **admin.site.each_context(request),
        'title': 'Login Logs',
        'logs': page_logs,
        'total': total,
        'search': search,
        'method_filter': method_filter,
        'status_filter': status_filter,
        'page': page,
        'total_pages': total_pages,
        'has_prev': page > 0,
        'has_next': end < total,
        'prev_page': page - 1,
        'next_page': page + 1,
    }
    return TemplateResponse(request, 'admin/login_logs.html', context)
