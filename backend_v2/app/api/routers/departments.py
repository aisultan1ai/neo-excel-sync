from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user_record, require_admin
from app.repositories.departments import (
    list_departments,
    add_department,
    delete_department,
    rename_department,
)
from app.schemas.departments import DepartmentCreate

router = APIRouter(tags=["departments"])


@router.get("/api/v2/departments")
def get_departments(current_user=Depends(get_current_user_record)):
    return list_departments()


@router.post("/api/v2/admin/departments")
def create_department(payload: DepartmentCreate, admin_user=Depends(require_admin)):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    try:
        row = add_department(name)
        return {"status": "success", "department": row}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/api/v2/admin/departments/{dept_id}")
def remove_department(dept_id: int, admin_user=Depends(require_admin)):
    ok = delete_department(dept_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Department not found")
    return {"status": "success"}


@router.put("/api/v2/admin/departments/{dept_id}")
def rename_department_endpoint(
    dept_id: int,
    payload: DepartmentCreate,
    admin_user=Depends(require_admin),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    ok = rename_department(dept_id, name)
    if not ok:
        raise HTTPException(status_code=404, detail="Department not found")

    return {"status": "success"}