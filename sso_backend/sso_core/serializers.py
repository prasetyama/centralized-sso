from rest_framework import serializers
from .models import User, Module

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'avatar_url', 'google_uid']
        read_only_fields = ['id']

class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ['code', 'name', 'description', 'redirect_url']

class GoogleLoginSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
