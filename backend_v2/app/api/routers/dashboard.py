from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_record
from app.services.dashboard_service import load_dashboard

router = APIRouter(prefix="/api/v2/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard_data(current_user=Depends(get_current_user_record)):
    return load_dashboard()