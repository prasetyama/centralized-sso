from rest_framework import serializers
from .models import User, Module, ModuleMatrix

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'department', 'role', 'image']
        read_only_fields = ['id']

class ModuleMatrixSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    redirect_url = serializers.SerializerMethodField()

    class Meta:
        model = ModuleMatrix
        fields = ['module', 'operator', 'name', 'description', 'redirect_url']

    def get_name(self, obj):
        module = self._get_module(obj)
        return module.name if module else None

    def get_description(self, obj):
        module = self._get_module(obj)
        return module.description if module else None

    def get_redirect_url(self, obj):
        module = self._get_module(obj)
        return module.redirect_url if module else None

    def _get_module(self, obj):
        """Lookup Module master data by code, with caching per serializer context."""
        if not hasattr(self, '_module_cache'):
            self._module_cache = {}
        if obj.module not in self._module_cache:
            self._module_cache[obj.module] = Module.objects.filter(
                code=obj.module, is_active=True
            ).first()
        return self._module_cache[obj.module]

class GoogleLoginSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
