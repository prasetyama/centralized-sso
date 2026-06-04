from django.db import models
import uuid

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

class User(BaseModel):
    google_uid = models.CharField(max_length=255, unique=True, null=True, blank=True, db_index=True)
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150, blank=True, null=True)
    avatar_url = models.URLField(max_length=500, blank=True, null=True)

    class Meta:
        db_table = 'user'

    def __str__(self):
        return f"{self.email}"

class Role(BaseModel):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='roles')
    name = models.CharField(max_length=100) # e.g., 'viewer_dashboard'
    key = models.CharField(max_length=150, unique=True, db_index=True) # e.g., 'eorder.viewer_dashboard'

    class Meta:
        db_table = 'role'
        unique_together = ('module', 'key')

    def __str__(self):
        return f"{self.name} ({self.key})"

class Menu(BaseModel):
    module = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='menus')
    code = models.CharField(max_length=50, db_index=True) # e.g., 'ORDER_LIST'
    name = models.CharField(max_length=100)

    class Meta:
        db_table = 'menu'
        unique_together = ('module', 'code')

    def __str__(self):
        return f"{self.name} ({self.code})"

class Permission(BaseModel):
    code = models.CharField(max_length=50, unique=True, db_index=True) # e.g., 'VIEW', 'SUBMIT'
    name = models.CharField(max_length=100)

    class Meta:
        db_table = 'permission'

    def __str__(self):
        return f"{self.name} ({self.code})"

class RoleMenuPermission(BaseModel):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='menu_permissions')
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE)
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)

    class Meta:
        db_table = 'role_menu_permission'
        unique_together = ('role', 'menu', 'permission')

    def __str__(self):
        return f"{self.role} - {self.menu} - {self.permission}"

class UserModuleRole(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='module_roles')
    module = models.ForeignKey(Module, on_delete=models.CASCADE)
    role = models.ForeignKey(Role, on_delete=models.CASCADE)

    class Meta:
        db_table = 'user_module_role'
        unique_together = ('user', 'module', 'role')
