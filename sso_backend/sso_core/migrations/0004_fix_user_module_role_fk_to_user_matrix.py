# Generated manually - Fix user_module_role FK to reference 'User Matrix' instead of 'user'

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('sso_core', '0003_alter_role_unique_together_role_menu_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                -- Drop the unique constraint covering user_id
                ALTER TABLE user_module_role
                    DROP INDEX user_module_role_user_id_module_id_role_id_01d61b18_uniq;

                -- Truncate existing data (no valid rows yet)
                TRUNCATE TABLE user_module_role;

                -- Change user_id column type from char(32) to int
                ALTER TABLE user_module_role
                    MODIFY COLUMN user_id int NOT NULL;

                -- Re-add unique constraint on (user_id, module_id, role_id)
                ALTER TABLE user_module_role
                    ADD UNIQUE KEY user_module_role_user_module_role_uniq (user_id, module_id, role_id);

                -- Add FK constraint referencing `User Matrix`.id
                ALTER TABLE user_module_role
                    ADD CONSTRAINT user_module_role_user_id_fk_user_matrix
                    FOREIGN KEY (user_id) REFERENCES `User Matrix`(id)
                    ON DELETE CASCADE;
            """,
            reverse_sql="""
                ALTER TABLE user_module_role
                    DROP FOREIGN KEY user_module_role_user_id_fk_user_matrix;

                ALTER TABLE user_module_role
                    DROP INDEX user_module_role_user_module_role_uniq;

                TRUNCATE TABLE user_module_role;

                ALTER TABLE user_module_role
                    MODIFY COLUMN user_id char(32) NOT NULL;
            """,
        ),
    ]

