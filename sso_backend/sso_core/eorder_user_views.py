import os
import csv
import bcrypt
from datetime import datetime
from pathlib import Path

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from django.db import transaction

from sso_core.models import LocalUser, ModuleMatrix, UserModuleRole, StdAreaMatrix, EorderDistributor, Module
from sso_core.views import BaseAuthenticatedView

# Setup Log Directory
LOG_DIR = Path(settings.BASE_DIR) / 'logs'
LOG_DIR.mkdir(exist_ok=True)


class AdminOnlyAPIView(BaseAuthenticatedView):
    """
    Base view enforcing that the requesting user has role = 'admin' (or 'ADMIN') in their JWT payload.
    """
    def check_admin(self, request):
        payload = self.get_user_from_token(request)
        user_role = str(payload.get('role', '')).upper()
        if user_role != 'ADMIN':
            raise PermissionError("Permission denied. Only ADMIN users can manage E-Order users.")
        return payload

    def handle_exception(self, exc):
        if isinstance(exc, PermissionError):
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        return super().handle_exception(exc)


class EOrderUserListView(AdminOnlyAPIView):
    """
    GET: List users with role = 'user_eorder' (or all EORDER users) along with mapped std_area_matrix details.
    """
    def get(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        query = request.query_params.get('q', '').strip()
        
        users_qs = LocalUser.objects.all()
        if query:
            users_qs = users_qs.filter(
                username__icontains=query
            ) | users_qs.filter(
                email__icontains=query
            ) | users_qs.filter(
                fname__icontains=query
            )

        if request.query_params.get('all_roles') != 'true':
            users_qs = users_qs.filter(role='user_eorder')

        result_list = []
        for u in users_qs.order_by('-id')[:200]:
            mapped_areas_qs = StdAreaMatrix.objects.filter(email__iexact=u.email) if u.email else StdAreaMatrix.objects.none()
            if not mapped_areas_qs.exists() and u.username:
                mapped_areas_qs = StdAreaMatrix.objects.filter(email__iexact=u.username)

            areas_list = []
            for area in mapped_areas_qs:
                dist_obj = None
                if area.shiptord:
                    dist_obj = EorderDistributor.objects.filter(ship_to=area.shiptord).first()
                    if not dist_obj:
                        dist_obj = EorderDistributor.objects.filter(dist_id=area.shiptord).first()

                areas_list.append({
                    "id": area.id,
                    "email": area.email,
                    "zone": area.zone,
                    "rd_desc": area.rd_desc,
                    "operator": area.operator,
                    "shiptord": area.shiptord,
                    "dist_id": dist_obj.dist_id if dist_obj else None,
                    "dist_name": dist_obj.dist_name if dist_obj else None
                })

            result_list.append({
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "fname": u.fname,
                "role": u.role,
                "department": u.department,
                "region": u.region,
                "employee_id": u.employee_id,
                "company_id": u.company_id,
                "mapped_areas": areas_list
            })

        return Response({"users": result_list}, status=status.HTTP_200_OK)


class EOrderUserImportView(AdminOnlyAPIView):
    """
    POST: Upload CSV file to import EORDERWEB users and create matrix records.
    """
    def post(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        file_obj = request.FILES.get('file')
        raw_content = request.data.get('content')

        if not file_obj and not raw_content:
            return Response({"error": "No CSV file or content provided."}, status=status.HTTP_400_BAD_REQUEST)

        if file_obj:
            content_str = file_obj.read().decode('utf-8-sig', errors='replace')
        else:
            content_str = raw_content

        lines = [line.strip() for line in content_str.splitlines() if line.strip()]
        if not lines:
            return Response({"error": "CSV content is empty."}, status=status.HTTP_400_BAD_REQUEST)

        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_filename = f"user_import_eorder_{timestamp_str}.log"
        log_filepath = LOG_DIR / log_filename

        log_entries = []

        def write_log(msg):
            log_entries.append(msg)

        write_log(f"=== EORDER USER IMPORT LOG - {datetime.now().isoformat()} ===")
        write_log(f"Total lines received: {len(lines)}")

        DEFAULT_PASS_PLAIN = "123456%qaz!"
        DEFAULT_PASS_HASH = bcrypt.hashpw(DEFAULT_PASS_PLAIN.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        first_line = lines[0]
        if '\t' in first_line:
            delimiter = '\t'
        elif ';' in first_line:
            delimiter = ';'
        else:
            delimiter = ','

        reader = csv.reader(lines, delimiter=delimiter)
        row_list = list(reader)

        success_count = 0
        failed_count = 0
        details = []

        eorder_module, _ = Module.objects.get_or_create(
            code='EORDER',
            defaults={'name': 'E-Order Web', 'description': 'EORDERWEB Module'}
        )

        row_start_index = 0
        if row_list and ('distid' in row_list[0][0].lower() or 'username' in ''.join(row_list[0]).lower()):
            row_start_index = 1
            write_log("Detected CSV header line. Processing data rows...")

        for idx, row in enumerate(row_list[row_start_index:], start=row_start_index + 1):
            if not row or len(row) < 4:
                msg = f"[ERROR] Row {idx}: Invalid column count (expected 4 columns: distid, Distributor Name, username, email). Row content: {row}"
                write_log(msg)
                failed_count += 1
                details.append({"row": idx, "status": "failed", "error": "Invalid column count"})
                continue

            distid_input = row[0].strip()
            distributor_name_input = row[1].strip()
            username_input = row[2].strip()
            email_input_raw = row[3].strip()

            if not username_input or not email_input_raw:
                msg = f"[ERROR] Row {idx}: Missing required username or email. Row content: {row}"
                write_log(msg)
                failed_count += 1
                details.append({"row": idx, "username": username_input, "distid": distid_input, "status": "failed", "error": "Missing username or email"})
                continue

            primary_email = email_input_raw.split(',')[0].strip().lower()

            # Lookup distributor in eorder_eorder_distributor
            dist_obj = EorderDistributor.objects.filter(dist_id=distid_input).first()
            if not dist_obj and distid_input.isdigit():
                zfilled = distid_input.zfill(6)
                dist_obj = EorderDistributor.objects.filter(dist_id=zfilled).first()
            if not dist_obj and distid_input.isdigit():
                all_dists = EorderDistributor.objects.all()
                for d in all_dists:
                    if d.dist_id and d.dist_id.isdigit() and int(d.dist_id) == int(distid_input):
                        dist_obj = d
                        break

            if not dist_obj:
                msg = f"[ERROR] Row {idx}: Distributor ID '{distid_input}' ('{distributor_name_input}') not found in table eorder_eorder_distributor for user '{username_input}' ({primary_email})."
                write_log(msg)
                failed_count += 1
                details.append({
                    "row": idx,
                    "username": username_input,
                    "email": primary_email,
                    "distid": distid_input,
                    "status": "failed",
                    "error": f"Distributor ID '{distid_input}' not found in database"
                })
                continue

            dist_zone = dist_obj.zone or 'ALL'
            dist_ship_to = dist_obj.ship_to or dist_obj.dist_id or distid_input
            dist_name = dist_obj.dist_name or distributor_name_input
            rd_desc = f"{dist_name} - {dist_obj.alamat3}" if dist_obj.alamat3 else dist_name

            try:
                with transaction.atomic():
                    # 1. Update / Create LocalUser
                    user_obj = LocalUser.objects.filter(username__iexact=username_input).first()
                    if not user_obj:
                        user_obj = LocalUser.objects.filter(email__iexact=primary_email).first()

                    if user_obj:
                        user_obj.username = username_input
                        user_obj.password = DEFAULT_PASS_HASH
                        user_obj.role = 'user_eorder'
                        user_obj.fname = distributor_name_input or dist_name
                        user_obj.email = primary_email
                        user_obj.region = None
                        user_obj.employee_id = None
                        user_obj.company_id = None
                        user_obj.save()
                    else:
                        LocalUser.objects.create(
                            username=username_input,
                            password=DEFAULT_PASS_HASH,
                            role='user_eorder',
                            fname=distributor_name_input or dist_name,
                            email=primary_email,
                            region=None,
                            employee_id=None,
                            company_id=None
                        )

                    # 2. Update / Create ModuleMatrix
                    mod_matrix = ModuleMatrix.objects.filter(email__iexact=primary_email, module='EORDER').first()
                    if not mod_matrix:
                        ModuleMatrix.objects.create(
                            email=primary_email,
                            module='EORDER',
                            operator='EQ'
                        )

                    # 3. Update / Create UserModuleRole
                    umr = UserModuleRole.objects.filter(user__iexact=primary_email, module_code=eorder_module).first()
                    if not umr:
                        UserModuleRole.objects.create(
                            user=primary_email,
                            module_code=eorder_module,
                            role='editor'
                        )
                    else:
                        umr.role = 'editor'
                        umr.save()

                    # 4. Update / Create StdAreaMatrix
                    std_area = StdAreaMatrix.objects.filter(email__iexact=primary_email, shiptord=dist_ship_to).first()
                    if not std_area:
                        StdAreaMatrix.objects.create(
                            email=primary_email,
                            zone=dist_zone,
                            rd_desc=rd_desc,
                            operator='EQ',
                            shiptord=dist_ship_to
                        )
                    else:
                        std_area.zone = dist_zone
                        std_area.rd_desc = rd_desc
                        std_area.operator = 'EQ'
                        std_area.save()

                success_count += 1
                msg = f"[SUCCESS] Row {idx}: Imported user '{username_input}' ({primary_email}) -> DistID: '{distid_input}', ShipToRD: '{dist_ship_to}', Zone: '{dist_zone}'."
                write_log(msg)
                details.append({
                    "row": idx,
                    "username": username_input,
                    "email": primary_email,
                    "distid": distid_input,
                    "shiptord": dist_ship_to,
                    "status": "success"
                })

            except Exception as ex:
                failed_count += 1
                msg = f"[ERROR] Row {idx}: Failed to save data for '{username_input}': {str(ex)}"
                write_log(msg)
                details.append({
                    "row": idx,
                    "username": username_input,
                    "email": primary_email,
                    "distid": distid_input,
                    "status": "failed",
                    "error": str(ex)
                })

        write_log(f"\n=== SUMMARY ===")
        write_log(f"Successful imports: {success_count}")
        write_log(f"Failed imports: {failed_count}")

        with open(log_filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(log_entries))

        return Response({
            "success": True,
            "total_processed": len(row_list) - row_start_index,
            "success_count": success_count,
            "failed_count": failed_count,
            "log_file": log_filename,
            "details": details
        }, status=status.HTTP_200_OK)


class EOrderUserDetailView(AdminOnlyAPIView):
    """
    POST: Create single EORDER user manually.
    PUT: Update user information & distributor mappings.
    DELETE: Delete user and associated matrix records.
    """
    def post(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        username = request.data.get('username', '').strip()
        email = request.data.get('email', '').strip().lower()
        fname = request.data.get('fname', '').strip()
        ship_to_list = request.data.get('ship_to_list', [])

        if not username or not email:
            return Response({"error": "username and email are required."}, status=status.HTTP_400_BAD_REQUEST)

        DEFAULT_PASS_PLAIN = request.data.get('password') or "123456%qaz!"
        DEFAULT_PASS_HASH = bcrypt.hashpw(DEFAULT_PASS_PLAIN.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        if LocalUser.objects.filter(username__iexact=username).exists():
            return Response({"error": f"User with username '{username}' already exists."}, status=status.HTTP_400_BAD_REQUEST)

        eorder_module, _ = Module.objects.get_or_create(code='EORDER', defaults={'name': 'E-Order Web'})

        with transaction.atomic():
            user = LocalUser.objects.create(
                username=username,
                password=DEFAULT_PASS_HASH,
                role='user_eorder',
                fname=fname,
                email=email
            )

            ModuleMatrix.objects.get_or_create(email=email, module='EORDER', defaults={'operator': 'EQ'})
            UserModuleRole.objects.get_or_create(user=email, module_code=eorder_module, defaults={'role': 'editor'})

            for ship_to in ship_to_list:
                dist_obj = EorderDistributor.objects.filter(ship_to=ship_to).first() or EorderDistributor.objects.filter(dist_id=ship_to).first()
                zone = dist_obj.zone if dist_obj else 'ALL'
                rd_desc = (dist_obj.dist_name + (f" - {dist_obj.alamat3}" if dist_obj.alamat3 else '')) if dist_obj else fname

                StdAreaMatrix.objects.get_or_create(
                    email=email,
                    shiptord=ship_to,
                    defaults={'zone': zone, 'rd_desc': rd_desc, 'operator': 'EQ'}
                )

        return Response({"success": True, "user_id": user.id}, status=status.HTTP_201_CREATED)

    def put(self, request, user_id):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        user = LocalUser.objects.filter(id=user_id).first()
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        old_email = user.email
        old_username = user.username

        new_username = request.data.get('username', user.username).strip()
        new_email = request.data.get('email', user.email or '').strip().lower()
        new_fname = request.data.get('fname', user.fname).strip()
        reset_password = request.data.get('reset_password', False)
        ship_to_list = request.data.get('ship_to_list', None)

        with transaction.atomic():
            user.username = new_username
            user.email = new_email
            user.fname = new_fname

            if reset_password:
                DEFAULT_PASS_HASH = bcrypt.hashpw("123456%qaz!".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                user.password = DEFAULT_PASS_HASH

            user.save()

            if old_email and old_email != new_email:
                ModuleMatrix.objects.filter(email__iexact=old_email).update(email=new_email)
                UserModuleRole.objects.filter(user__iexact=old_email).update(user=new_email)
                StdAreaMatrix.objects.filter(email__iexact=old_email).update(email=new_email)
            elif old_username and old_username != new_email:
                ModuleMatrix.objects.filter(email__iexact=old_username).update(email=new_email)
                UserModuleRole.objects.filter(user__iexact=old_username).update(user=new_email)
                StdAreaMatrix.objects.filter(email__iexact=old_username).update(email=new_email)

            eorder_module, _ = Module.objects.get_or_create(code='EORDER')
            ModuleMatrix.objects.get_or_create(email=new_email, module='EORDER', defaults={'operator': 'EQ'})
            UserModuleRole.objects.get_or_create(user=new_email, module_code=eorder_module, defaults={'role': 'editor'})

            if ship_to_list is not None:
                StdAreaMatrix.objects.filter(email__iexact=new_email).delete()
                for ship_to in ship_to_list:
                    dist_obj = EorderDistributor.objects.filter(ship_to=ship_to).first() or EorderDistributor.objects.filter(dist_id=ship_to).first()
                    zone = dist_obj.zone if dist_obj else 'ALL'
                    rd_desc = (dist_obj.dist_name + (f" - {dist_obj.alamat3}" if dist_obj.alamat3 else '')) if dist_obj else new_fname

                    StdAreaMatrix.objects.create(
                        email=new_email,
                        zone=zone,
                        rd_desc=rd_desc,
                        operator='EQ',
                        shiptord=ship_to
                    )

        return Response({"success": True}, status=status.HTTP_200_OK)

    def delete(self, request, user_id):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        user = LocalUser.objects.filter(id=user_id).first()
        if not user:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        email = user.email
        username = user.username

        with transaction.atomic():
            user.delete()
            if email:
                ModuleMatrix.objects.filter(email__iexact=email).delete()
                UserModuleRole.objects.filter(user__iexact=email).delete()
                StdAreaMatrix.objects.filter(email__iexact=email).delete()
            if username:
                ModuleMatrix.objects.filter(email__iexact=username).delete()
                UserModuleRole.objects.filter(user__iexact=username).delete()
                StdAreaMatrix.objects.filter(email__iexact=username).delete()

        return Response({"success": True}, status=status.HTTP_200_OK)


class EOrderUserDistributorsView(AdminOnlyAPIView):
    """
    GET: List available distributors for UI dropdowns.
    """
    def get(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        q = request.query_params.get('q', '').strip()
        qs = EorderDistributor.objects.all()
        if q:
            qs = qs.filter(dist_name__icontains=q) | qs.filter(dist_id__icontains=q) | qs.filter(ship_to__icontains=q)

        distributors = []
        for d in qs.order_by('dist_name')[:100]:
            distributors.append({
                "dist_id": d.dist_id,
                "ship_to": d.ship_to,
                "dist_name": d.dist_name,
                "city": d.alamat3,
                "zone": d.zone
            })

        return Response({"distributors": distributors}, status=status.HTTP_200_OK)


class EOrderImportLogsView(AdminOnlyAPIView):
    """
    GET: List import log files or view specific log file content.
    """
    def get(self, request, filename=None):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)

        if filename:
            safe_filename = os.path.basename(filename)
            file_path = LOG_DIR / safe_filename
            if not file_path.exists():
                return Response({"error": "Log file not found."}, status=status.HTTP_404_NOT_FOUND)
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            return Response({"filename": safe_filename, "content": content}, status=status.HTTP_200_OK)

        log_files = []
        for p in LOG_DIR.glob('user_import_eorder_*.log'):
            stat = p.stat()
            log_files.append({
                "filename": p.name,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat()
            })

        log_files.sort(key=lambda x: x['created_at'], reverse=True)
        return Response({"logs": log_files}, status=status.HTTP_200_OK)
