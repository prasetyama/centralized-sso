from datetime import datetime
from django.db import connection, transaction
from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework import status

from sso_core.models import StdAreaMatrix, EorderDistributor
from sso_core.eorder_user_views import AdminOnlyAPIView


STANDARD_ZONES = [
    'ZONE-1', 'ZONE-2', 'ZONE-3', 'ZONE-4', 'ZONE-5',
    'ZONE-6', 'ZONE-7', 'ZONE-8', 'ZONE-9',
    'ALL', 'ZONE-0', 'NO ZONE'
]


def _classify_user_rows(rows, remarks=None, is_distributor=False):
    """
    Classify a user's std_area_matrix rows into RSM, ASM, GLOBAL, or DISTRIBUTOR
    without extra database queries.
    """
    if is_distributor:
        return "DISTRIBUTOR"

    has_global_all = any(
        r["operator"] == "EQ"
        and r["shiptord"].upper() == "ALL"
        and r["zone"].upper() in ("ALL", "")
        for r in rows
    )
    if has_global_all:
        return "GLOBAL"

    has_zone_all = any(
        r["operator"] == "EQ"
        and r["shiptord"].upper() == "ALL"
        and r["zone"].upper() not in ("ALL", "NO ZONE", "")
        for r in rows
    )
    remarks_lower = (remarks or "").strip().lower()
    if has_zone_all or remarks_lower.startswith("regional"):
        return "RSM"

    return "ASM"


def _fetch_matrix_data(q="", zone_filter="", operator_filter="", mapping_type_filter="rsm_asm"):
    """
    Fetch std_area_matrix rows joined with User Matrix and eorder_eorder_distributor
    in a single SQL query.
    """
    type_filter = (mapping_type_filter or "rsm_asm").strip().upper()
    zone_upper = zone_filter.strip().upper()
    op_upper = operator_filter.strip().upper()
    q_lower = q.strip().lower()

    where_clauses = ["sam.Email IS NOT NULL", "TRIM(sam.Email) <> ''"]
    params = []

    if type_filter != "ALL":
        where_clauses.append("sam.Email LIKE '%%@%%'")
        where_clauses.append(
            """
            NOT EXISTS (
                SELECT 1 FROM users u
                WHERE (LOWER(TRIM(u.email)) = LOWER(TRIM(sam.Email)) OR LOWER(TRIM(u.username)) = LOWER(TRIM(sam.Email)))
                  AND u.role IN ('user_eorder', 'RD', 'eorder_user')
            )
            """
        )

    sql = f"""
        SELECT
            sam.id,
            TRIM(sam.Email) AS email,
            TRIM(COALESCE(sam.Zone, '')) AS zone,
            TRIM(COALESCE(sam.RD_DESC, '')) AS rd_desc,
            UPPER(TRIM(COALESCE(sam.Operator, 'EQ'))) AS operator,
            TRIM(COALESCE(sam.ShipToRD, '')) AS shiptord,
            um.Name AS um_name,
            um.Department AS um_dept,
            um.Role AS um_role,
            um.ManagerEmail AS manager_email,
            um.Remarks AS remarks,
            d.DistID AS dist_id,
            d.DistName AS dist_name,
            d.Alamat3 AS city
        FROM std_area_matrix sam
        LEFT JOIN (
            SELECT
                LOWER(TRIM(Email)) AS clean_email,
                MAX(Name) AS Name,
                MAX(Department) AS Department,
                MAX(Role) AS Role,
                MAX(ManagerEmail) AS ManagerEmail,
                MAX(Remarks) AS Remarks
            FROM `User Matrix`
            WHERE Email IS NOT NULL
            GROUP BY LOWER(TRIM(Email))
        ) um ON LOWER(TRIM(sam.Email)) = um.clean_email
        LEFT JOIN (
            SELECT
                TRIM(Ship_To) AS clean_shipto,
                MAX(DistID) AS DistID,
                MAX(DistName) AS DistName,
                MAX(Alamat3) AS Alamat3
            FROM eorder_eorder_distributor
            WHERE Ship_To IS NOT NULL AND TRIM(Ship_To) <> ''
            GROUP BY TRIM(Ship_To)
        ) d ON TRIM(sam.ShipToRD) = d.clean_shipto
        WHERE {" AND ".join(where_clauses)}
        ORDER BY sam.Email, sam.Zone, sam.Operator, sam.ShipToRD, sam.id
    """

    raw_by_email = {}
    meta_by_email = {}

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        for (
            row_id,
            email,
            zone,
            rd_desc,
            operator,
            shiptord,
            um_name,
            um_dept,
            um_role,
            manager_email,
            remarks,
            dist_id,
            dist_name,
            city,
        ) in cursor.fetchall():
            clean_email = email.lower()
            name_val = um_name.strip() if um_name and um_name.strip() and um_name.strip() != "BWM1" else None

            if clean_email not in meta_by_email:
                meta_by_email[clean_email] = {
                    "email": email,
                    "name": name_val,
                    "department": um_dept.strip() if um_dept else None,
                    "user_role": um_role.strip() if um_role else None,
                    "manager_email": manager_email.strip() if manager_email else None,
                    "remarks": remarks.strip() if remarks else None,
                    "is_distributor": "@" not in clean_email or (um_role or "").strip().upper() == "RD",
                }

            raw_by_email.setdefault(clean_email, []).append(
                {
                    "id": row_id,
                    "email": email,
                    "zone": zone,
                    "rd_desc": rd_desc,
                    "operator": operator if operator in ("EQ", "EX") else "EQ",
                    "shiptord": shiptord,
                    "dist_id": dist_id.strip() if dist_id else None,
                    "dist_name": dist_name.strip() if dist_name else None,
                    "city": city.strip() if city else None,
                }
            )

    grouped_users = []
    flat_rows = []

    for clean_email, user_rows in raw_by_email.items():
        meta = meta_by_email[clean_email]
        m_type = _classify_user_rows(user_rows, remarks=meta["remarks"], is_distributor=meta["is_distributor"])

        if type_filter in ("RSM", "ASM", "GLOBAL", "DISTRIBUTOR") and m_type != type_filter:
            continue

        matching_rows = []
        for r in user_rows:
            if zone_upper and r["zone"].upper() != zone_upper:
                continue
            if op_upper and r["operator"].upper() != op_upper:
                continue

            if q_lower:
                haystack = " ".join(
                    filter(
                        None,
                        [
                            meta["email"],
                            meta["name"],
                            meta["department"],
                            meta["manager_email"],
                            meta["remarks"],
                            m_type,
                            r["zone"],
                            r["shiptord"],
                            r["rd_desc"],
                            r["operator"],
                            r["dist_id"],
                            r["dist_name"],
                            r["city"],
                        ],
                    )
                ).lower()
                if q_lower not in haystack:
                    continue

            enriched_row = {
                **r,
                "name": meta["name"],
                "department": meta["department"],
                "manager_email": meta["manager_email"],
                "remarks": meta["remarks"],
                "mapping_type": m_type,
            }
            matching_rows.append(enriched_row)
            flat_rows.append(enriched_row)

        if not matching_rows:
            continue

        distinct_zones = sorted(
            {r["zone"] for r in user_rows if r["zone"]},
            key=lambda z: (0 if z.upper() == "ALL" else 1, z.upper()),
        )
        eq_count = sum(1 for r in user_rows if r["operator"] == "EQ")
        ex_count = sum(1 for r in user_rows if r["operator"] == "EX")

        grouped_users.append(
            {
                "email": meta["email"],
                "name": meta["name"],
                "department": meta["department"],
                "user_role": meta["user_role"],
                "manager_email": meta["manager_email"],
                "remarks": meta["remarks"],
                "mapping_type": m_type,
                "zones": distinct_zones,
                "eq_count": eq_count,
                "ex_count": ex_count,
                "total_rows": len(user_rows),
                "rows": user_rows,
            }
        )

    grouped_users.sort(
        key=lambda u: (
            0 if u["mapping_type"] == "RSM" else 1 if u["mapping_type"] == "ASM" else 2 if u["mapping_type"] == "GLOBAL" else 3,
            (u["email"] or "").lower(),
        )
    )

    return grouped_users, flat_rows


def _lookup_distributor_map(shiptos):
    """
    Lookup distributor details only for the requested ShipToRD codes.
    """
    clean_codes = [s.strip() for s in shiptos if s and s.strip() and s.strip().upper() != "ALL"]
    if not clean_codes:
        return {}

    result = {}
    for d in EorderDistributor.objects.filter(ship_to__in=clean_codes):
        ship_to = (d.ship_to or "").strip()
        dist_name = (d.dist_name or "").strip()
        city = (d.alamat3 or "").strip()
        zone = (d.zone or "").strip()
        is_active = str(d.flag or "").strip() == "1"
        rd_desc = f"{dist_name} - {city}" if (dist_name and city) else dist_name
        if ship_to and (ship_to not in result or is_active):
            result[ship_to] = {
                "ship_to": ship_to,
                "zone": zone,
                "rd_desc": rd_desc,
                "dist_name": dist_name,
            }
    return result


class StdAreaMatrixListView(AdminOnlyAPIView):
    def get(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        q = request.query_params.get("q", "")
        zone_filter = request.query_params.get("zone", "")
        operator_filter = request.query_params.get("operator", "")
        mapping_type_filter = request.query_params.get("mapping_type", "rsm_asm")

        grouped_users, flat_rows = _fetch_matrix_data(
            q=q,
            zone_filter=zone_filter,
            operator_filter=operator_filter,
            mapping_type_filter=mapping_type_filter,
        )

        return Response(
            {
                "users": grouped_users,
                "rows": flat_rows,
                "available_zones": STANDARD_ZONES,
            },
            status=status.HTTP_200_OK,
        )


class StdAreaMatrixOptionsView(AdminOnlyAPIView):
    def get(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        candidate_users = []
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT Email, Name, Department, Role, ManagerEmail, Remarks
                FROM `User Matrix`
                WHERE Email IS NOT NULL AND TRIM(Email) <> ''
                ORDER BY Email ASC
                """
            )
            for email, name, dept, role, mgr_email, remarks in cursor.fetchall():
                clean_name = name.strip() if name and name.strip() and name.strip() != "BWM1" else None
                remarks_str = (remarks or "").strip()
                is_rsm = remarks_str.lower().startswith("regional")
                candidate_users.append(
                    {
                        "email": email.strip(),
                        "name": clean_name,
                        "department": dept.strip() if dept else None,
                        "role": role.strip() if role else None,
                        "manager_email": mgr_email.strip() if mgr_email else None,
                        "remarks": remarks_str or None,
                        "suggested_type": "RSM" if is_rsm else "ASM",
                    }
                )

        distributors = []
        for d in EorderDistributor.objects.filter(flag="1").order_by("zone", "dist_name"):
            ship_to = (d.ship_to or "").strip()
            dist_id = (d.dist_id or "").strip()
            if not ship_to or not dist_id:
                continue
            dist_name = (d.dist_name or "").strip()
            city = (d.alamat3 or "").strip()
            zone = (d.zone or "").strip()
            distributors.append(
                {
                    "ship_to": ship_to,
                    "dist_id": dist_id,
                    "dist_name": dist_name,
                    "city": city,
                    "zone": zone,
                    "is_active": True,
                    "rd_desc": f"{dist_name} - {city}" if (dist_name and city) else dist_name,
                }
            )

        return Response(
            {
                "candidate_users": candidate_users,
                "distributors": distributors,
                "zones": STANDARD_ZONES,
            },
            status=status.HTTP_200_OK,
        )


class StdAreaMatrixUserMappingView(AdminOnlyAPIView):
    """
    Save or delete all std_area_matrix mappings for a specific user email (RSM / ASM).
    """
    def post(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        email = (request.data.get("email") or "").strip().lower()
        old_email = (request.data.get("old_email") or "").strip().lower()
        entries = request.data.get("entries")
        replace = bool(request.data.get("replace", True))

        if not email:
            return Response({"error": "Email user wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(entries, list) or len(entries) == 0:
            return Response(
                {"error": "Minimal satu rule mapping (Zone atau Distributor Ship-To) wajib dipilih."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dist_map = _lookup_distributor_map([str(raw.get("shiptord") or "") for raw in entries])
        normalized_entries = []
        seen_keys = set()

        for raw in entries:
            shipto = str(raw.get("shiptord") or "").strip()
            zone = str(raw.get("zone") or "").strip()
            operator = str(raw.get("operator") or "EQ").strip().upper()
            rd_desc = str(raw.get("rd_desc") or "").strip()

            if operator not in ("EQ", "EX"):
                operator = "EQ"
            if not shipto:
                continue

            if shipto.upper() == "ALL":
                shipto = "ALL"
                zone = zone.upper() if zone else "ALL"
                rd_desc = rd_desc or "ALL"
            else:
                dist_info = dist_map.get(shipto)
                if dist_info:
                    zone = zone or dist_info["zone"] or "ALL"
                    rd_desc = rd_desc or dist_info["rd_desc"] or dist_info["dist_name"] or shipto
                else:
                    zone = zone or "ALL"
                    rd_desc = rd_desc or shipto

            dedup_key = (zone.upper(), shipto.upper(), operator)
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            normalized_entries.append(
                {
                    "email": email[:50],
                    "zone": zone[:20],
                    "rd_desc": rd_desc[:100],
                    "operator": operator[:4],
                    "shiptord": shipto[:20],
                }
            )

        if not normalized_entries:
            return Response(
                {"error": "Tidak ada data mapping yang valid untuk disimpan."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            if replace:
                if old_email and old_email != email:
                    StdAreaMatrix.objects.filter(email__iexact=old_email).delete()
                StdAreaMatrix.objects.filter(email__iexact=email).delete()
                for item in normalized_entries:
                    StdAreaMatrix.objects.create(**item)
            else:
                existing_rows = list(StdAreaMatrix.objects.filter(email__iexact=email))
                existing_keys = {
                    ((r.zone or "").strip().upper(), (r.shiptord or "").strip().upper(), (r.operator or "EQ").strip().upper())
                    for r in existing_rows
                }
                for item in normalized_entries:
                    key = (item["zone"].upper(), item["shiptord"].upper(), item["operator"].upper())
                    if key not in existing_keys:
                        StdAreaMatrix.objects.create(**item)
                        existing_keys.add(key)

        return Response(
            {
                "success": True,
                "email": email,
                "saved_count": len(normalized_entries),
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        email = (request.query_params.get("email") or request.data.get("email") or "").strip()
        if not email:
            return Response({"error": "Parameter email wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)

        deleted_count, _ = StdAreaMatrix.objects.filter(email__iexact=email).delete()
        return Response(
            {"success": True, "email": email, "deleted_count": deleted_count},
            status=status.HTTP_200_OK,
        )


class StdAreaMatrixRowView(AdminOnlyAPIView):
    """
    Create, update, or delete individual rows in std_area_matrix.
    """
    def post(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        email = (request.data.get("email") or "").strip().lower()
        shipto = (request.data.get("shiptord") or "").strip()
        zone = (request.data.get("zone") or "").strip()
        operator = (request.data.get("operator") or "EQ").strip().upper()
        rd_desc = (request.data.get("rd_desc") or "").strip()

        if not email or not shipto:
            return Response(
                {"error": "Field Email dan ShipToRD wajib diisi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if operator not in ("EQ", "EX"):
            return Response(
                {"error": "Operator harus bernilai EQ (Include) atau EX (Exclude)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if shipto.upper() == "ALL":
            shipto = "ALL"
            zone = zone.upper() if zone else "ALL"
            rd_desc = rd_desc or "ALL"
        else:
            dist_info = _lookup_distributor_map([shipto]).get(shipto)
            if dist_info:
                zone = zone or dist_info["zone"] or "ALL"
                rd_desc = rd_desc or dist_info["rd_desc"] or dist_info["dist_name"] or shipto
            else:
                zone = zone or "ALL"
                rd_desc = rd_desc or shipto

        duplicate = StdAreaMatrix.objects.filter(
            email__iexact=email,
            zone__iexact=zone,
            shiptord__iexact=shipto,
            operator__iexact=operator,
        ).first()
        if duplicate:
            return Response(
                {"error": f"Baris mapping untuk {email} dengan Zone '{zone}', ShipToRD '{shipto}', dan Operator '{operator}' sudah ada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        row_obj = StdAreaMatrix.objects.create(
            email=email[:50],
            zone=zone[:20],
            rd_desc=rd_desc[:100],
            operator=operator[:4],
            shiptord=shipto[:20],
        )

        return Response(
            {
                "success": True,
                "row": {
                    "id": row_obj.id,
                    "email": row_obj.email,
                    "zone": row_obj.zone,
                    "rd_desc": row_obj.rd_desc,
                    "operator": row_obj.operator,
                    "shiptord": row_obj.shiptord,
                },
            },
            status=status.HTTP_201_CREATED,
        )

    def put(self, request, row_id):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        row_obj = StdAreaMatrix.objects.filter(id=row_id).first()
        if not row_obj:
            return Response({"error": "Baris std_area_matrix tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)

        email = (request.data.get("email") or row_obj.email or "").strip().lower()
        shipto = (request.data.get("shiptord") or row_obj.shiptord or "").strip()
        zone = (request.data.get("zone") if "zone" in request.data else (row_obj.zone or "")).strip()
        operator = (request.data.get("operator") or row_obj.operator or "EQ").strip().upper()
        rd_desc = (request.data.get("rd_desc") if "rd_desc" in request.data else (row_obj.rd_desc or "")).strip()

        if not email or not shipto:
            return Response(
                {"error": "Field Email dan ShipToRD wajib diisi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if operator not in ("EQ", "EX"):
            return Response(
                {"error": "Operator harus bernilai EQ atau EX."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if shipto.upper() == "ALL":
            shipto = "ALL"
            zone = zone.upper() if zone else "ALL"
            rd_desc = rd_desc or "ALL"
        else:
            dist_info = _lookup_distributor_map([shipto]).get(shipto)
            if dist_info:
                zone = zone or dist_info["zone"] or "ALL"
                rd_desc = rd_desc or dist_info["rd_desc"] or dist_info["dist_name"] or shipto

        row_obj.email = email[:50]
        row_obj.zone = zone[:20]
        row_obj.rd_desc = rd_desc[:100]
        row_obj.operator = operator[:4]
        row_obj.shiptord = shipto[:20]
        row_obj.save()

        return Response({"success": True, "id": row_obj.id}, status=status.HTTP_200_OK)

    def delete(self, request, row_id):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        row_obj = StdAreaMatrix.objects.filter(id=row_id).first()
        if not row_obj:
            return Response({"error": "Baris std_area_matrix tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)

        row_obj.delete()
        return Response({"success": True}, status=status.HTTP_200_OK)


class StdAreaMatrixExportView(AdminOnlyAPIView):
    """
    Export std_area_matrix rows and RSM/ASM user summary to Excel (.xlsx).
    """
    def get(self, request):
        try:
            self.check_admin(request)
        except PermissionError as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        q = request.query_params.get("q", "")
        zone_filter = request.query_params.get("zone", "")
        operator_filter = request.query_params.get("operator", "")
        mapping_type_filter = request.query_params.get("mapping_type", "rsm_asm")

        grouped_users, flat_rows = _fetch_matrix_data(
            q=q,
            zone_filter=zone_filter,
            operator_filter=operator_filter,
            mapping_type_filter=mapping_type_filter,
        )

        import openpyxl
        from openpyxl.utils import get_column_letter
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        wb = openpyxl.Workbook()

        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        alignment_center = Alignment(horizontal="center", vertical="center")
        thin_border = Border(
            left=Side(style="thin", color="E5E7EB"),
            right=Side(style="thin", color="E5E7EB"),
            top=Side(style="thin", color="E5E7EB"),
            bottom=Side(style="thin", color="E5E7EB"),
        )

        ws_users = wb.active
        ws_users.title = "RSM & ASM Summary"
        user_headers = [
            "No",
            "Email",
            "Nama User",
            "Kategori Mapping",
            "Department",
            "Manager Email",
            "Regional / Remarks",
            "Zones",
            "Jumlah EQ (Include)",
            "Jumlah EX (Exclude)",
            "Daftar ShipToRD",
        ]
        ws_users.append(user_headers)
        for col_num in range(1, len(user_headers) + 1):
            cell = ws_users.cell(row=1, column=col_num)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = alignment_center

        for idx, u in enumerate(grouped_users, 1):
            shipto_summary = ", ".join(
                f"{r['shiptord']} ({r['zone'] or '-'}{', EX' if r['operator'] == 'EX' else ''})"
                for r in u["rows"]
            )
            ws_users.append(
                [
                    idx,
                    u["email"] or "-",
                    u["name"] or "-",
                    u["mapping_type"],
                    u["department"] or "-",
                    u["manager_email"] or "-",
                    u["remarks"] or "-",
                    ", ".join(u["zones"]) if u["zones"] else "-",
                    u["eq_count"],
                    u["ex_count"],
                    shipto_summary or "-",
                ]
            )

        ws_rows = wb.create_sheet(title="std_area_matrix Detail")
        row_headers = [
            "No",
            "ID",
            "Email",
            "Nama User",
            "Kategori",
            "Department",
            "Zone",
            "Operator",
            "ShipToRD",
            "RD_DESC",
            "DistID",
            "Nama Distributor",
            "Kota",
        ]
        ws_rows.append(row_headers)
        for col_num in range(1, len(row_headers) + 1):
            cell = ws_rows.cell(row=1, column=col_num)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = alignment_center

        for idx, r in enumerate(flat_rows, 1):
            ws_rows.append(
                [
                    idx,
                    r["id"],
                    r["email"] or "-",
                    r["name"] or "-",
                    r["mapping_type"],
                    r["department"] or "-",
                    r["zone"] or "-",
                    r["operator"] or "-",
                    r["shiptord"] or "-",
                    r["rd_desc"] or "-",
                    r["dist_id"] or "-",
                    r["dist_name"] or "-",
                    r["city"] or "-",
                ]
            )

        for ws in (ws_users, ws_rows):
            for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=ws.max_column):
                for cell in row:
                    cell.border = thin_border
            for col in ws.columns:
                max_len = min(max(len(str(cell.value or "")) for cell in col), 60)
                col_letter = get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        response = HttpResponse(
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        filename = f"std_area_matrix_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        wb.save(response)
        return response
