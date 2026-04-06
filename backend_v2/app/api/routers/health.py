from fastapi import APIRouter

router = APIRouter(prefix="/api/v2/health", tags=["health"])


@router.get("")
def health_check():
    return {"status": "ok", "service": "neoexcelsync-v2"}