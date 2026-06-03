from fastapi import APIRouter

from beatos_http.pro import pro_available

router = APIRouter(tags=["pro"])


@router.get("/api/pro/status")
async def pro_status() -> dict:
    return {"publish": pro_available()}
