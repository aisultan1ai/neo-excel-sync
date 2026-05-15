from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.deps import require_admin
from db.departments import get_all_departments, add_department, delete_department, rename_department

router = APIRouter()


class DeptCreate(BaseModel):
    name: str


@router.get("/api/v1/departments")
def get_departments_list():
    return get_all_departments()


@router.post("/api/v1/admin/departments")
def create_department(dept: DeptCreate, current_user: str = Depends(require_admin)):
    success, msg = add_department(dept.name)
    if not success:
        raise HTTPException(400, msg)
    return {"status": "success"}


@router.delete("/api/v1/admin/departments/{dept_id}")
def remove_department(dept_id: int, current_user: str = Depends(require_admin)):
    if delete_department(dept_id):
        return {"status": "success"}
    raise HTTPException(400, "Error deleting department")


@router.put("/api/v1/admin/departments/{dept_id}")
def rename_department_endpoint(
    dept_id: int, dept: DeptCreate, current_user: str = Depends(require_admin)
):
    if rename_department(dept_id, dept.name):
        return {"status": "success"}
    raise HTTPException(400, "Error renaming")
