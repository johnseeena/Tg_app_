from fastapi import APIRouter, Depends

from .. import ikev2_manager, models, schemas
from ..config import settings
from ..deps import get_current_user

router = APIRouter(prefix="/api/server", tags=["server"])


@router.get("/params", response_model=schemas.ServerParams)
async def server_params(user: models.User = Depends(get_current_user)):
    return schemas.ServerParams(
        endpoint_host=settings.vpn_endpoint_host,
        ca_cert_base64=ikev2_manager.get_ca_cert_base64(),
    )
