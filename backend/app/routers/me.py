from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.permissions import permissions_summary
from app.database import get_db
from app.models.user import User
from app.schemas.user import MeRead

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("", response_model=MeRead)
def get_me(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return MeRead(
        **{
            "id": user.id,
            "zitadel_sub": user.zitadel_sub,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "scope_type": user.scope_type,
            "reseller_id": user.reseller_id,
            "company_id": user.company_id,
            "is_active": user.is_active,
            "permissions": permissions_summary(user),
        }
    )
