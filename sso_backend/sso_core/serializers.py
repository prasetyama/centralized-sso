from rest_framework import serializers
from .models import User, ModuleMatrix

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'department', 'role', 'image']
        read_only_fields = ['id']

class ModuleMatrixSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModuleMatrix
        fields = ['module', 'operator']

class GoogleLoginSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
