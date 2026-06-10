from django.db import models
import uuid

class ITamModule(models.Model):
    id = models.IntegerField(primary_key=True)

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
    email = models.EmailField(unique=True, db_index=True)
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

class UserModuleRole(BaseModel):
    ROLE_VIEWER = 'viewer'
    ROLE_EDITOR = 'editor'
    ROLE_ADMIN = 'admin'
    ROLE_CHOICES = [
        (ROLE_VIEWER, 'Viewer'),
        (ROLE_EDITOR, 'Editor'),
        (ROLE_ADMIN, 'Admin'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='module_roles')
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='user_roles')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_VIEWER)

    class Meta:
        db_table = 'user_module_role'
        unique_together = ('user', 'module')  # satu role per module per user

    def __str__(self):
        return f"{self.user} - {self.module.code} ({self.role})"


class ModuleMatrix(ITamModule):
    email = models.EmailField(unique=True, db_index=True)
    module = models.CharField(max_length=50, db_index=True)
    operator = models.CharField(max_length=50, db_index=True)
    
    class Meta:
        db_table = 'module_matrix'
        managed = False  # external table, Django won't alter it

