from fastapi import APIRouter, Depends

from app.api.deps import get_current_user_record
from app.schemas.settings import SettingsPayload
from app.services.settings_service import load_settings, save_settings

router = APIRouter(prefix="/api/v2/settings", tags=["settings"])


@router.get("")
def get_settings(current_user=Depends(get_current_user_record)):
    return load_settings()


@router.post("")
def update_settings(
    payload: SettingsPayload,
    current_user=Depends(get_current_user_record),
):
    saved = save_settings(payload.data)
    return {"status": "success", "settings": saved}