from django.db import models
import uuid

class ITamModule(models.Model):
    id = models.IntegerField(primary_key=True, editable=False)

    class Meta:
        abstract = True

class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True

class Module(BaseModel):
    code = models.CharField(max_length=50, unique=True, db_index=True) # e.g., 'eorder'
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    redirect_url = models.URLField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'module'

    def __str__(self):
        return f"{self.name} ({self.code})"

class User(ITamModule):
    # google_uid = models.CharField(max_length=255, unique=True, null=True, blank=True, db_index=True)
    email = models.CharField(max_length=255, unique=True, db_index=True)
    name = models.CharField(max_length=150)
    department = models.CharField(max_length=150)
    role = models.CharField(max_length=50)
    image = models.URLField(max_length=500, blank=True, null=True)
    status = models.CharField(max_length=2)

    class Meta:
        db_table = 'User Matrix'
        managed = False  # external table, Django won't alter it

    def __str__(self):
        return f"{self.email}"

class UserModuleRole(ITamModule):
    ROLE_VIEWER = 'viewer'
    ROLE_EDITOR = 'editor'
    ROLE_ADMIN = 'admin'
    ROLE_APPROVAL = 'approval'
    ROLE_CHOICES = [
        (ROLE_VIEWER, 'Viewer'),
        (ROLE_EDITOR, 'Editor'),
        (ROLE_ADMIN, 'Admin'),
        (ROLE_APPROVAL, 'Approval'),
    ]

    user = models.ForeignKey(User, to_field='email', db_column='email', on_delete=models.CASCADE, related_name='module_roles')
    module_code = models.ForeignKey(
        Module,
        to_field='code',
        db_column='module_code',
        on_delete=models.CASCADE,
        related_name='user_roles'
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_VIEWER)

    class Meta:
        db_table = 'user_module_role'
        unique_together = ('user', 'module_code')  # satu role per module per user

    def __str__(self):
        return f"{self.user} - {self.module_code_id} ({self.role})"


class ModuleMatrix(ITamModule):
    email = models.CharField(max_length=255, db_index=True)
    module = models.CharField(max_length=50, db_index=True)
    operator = models.CharField(max_length=50, db_index=True)
    
    class Meta:
        db_table = 'module_matrix'
        managed = False  # external table, Django won't alter it
        unique_together = ('email', 'module')

class Role(ITamModule):
    code = models.CharField(max_length=50, unique=True, db_index=True) # e.g., 'eorder'
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'aw_role'

    def __str__(self):
        return f"{self.name} ({self.code})"

class TitleMatrix(ITamModule):

    dept = models.CharField(max_length=50)
    title = models.ForeignKey(Role, to_field='code', db_column='title', on_delete=models.CASCADE, related_name='title_matrixes')
    user = models.CharField(max_length=255, db_column='email')

    class Meta:
        db_table = 'user_title_matrix'
        managed = False
        unique_together = ('title', 'user')

class LocalUser(models.Model):
    username = models.CharField(max_length=255, unique=True)
    password = models.CharField(max_length=255)
    role = models.CharField(max_length=50, blank=True, null=True)
    fname = models.CharField(max_length=255, blank=True, null=True)
    department = models.CharField(max_length=255, blank=True, null=True)
    region = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'users'
        managed = False

    def __str__(self):
        return f"{self.username}"


class LoginLog(models.Model):
    LOGIN_METHOD_CHOICES = [
        ('google', 'Google OAuth'),
        ('manual', 'Manual Login'),
        ('impersonate', 'Impersonate'),
    ]
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.CharField(max_length=255, db_index=True)  # email or username
    login_method = models.CharField(max_length=20, choices=LOGIN_METHOD_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'login_log'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', '-created_at']),
        ]

    def __str__(self):
        return f"{self.email} [{self.login_method}] {self.status} @ {self.created_at}"
