from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin

# Role values: superadmin | reseller_admin | company_admin | system_operator | system_viewer
# scope_type only matters for system_operator/system_viewer: company_wide | assigned
ROLES = ("superadmin", "reseller_admin", "company_admin", "system_operator", "system_viewer")
SCOPE_TYPES = ("company_wide", "assigned")


class User(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "users"

    zitadel_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    contact_number: Mapped[str | None] = mapped_column(String(30))
    requested_company_name: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(String(512))
    account_state: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    # NULL role = auto-provisioned, unprivileged until a superadmin/admin assigns one.
    role: Mapped[str | None] = mapped_column(String(30))
    scope_type: Mapped[str | None] = mapped_column(String(20))
    reseller_id: Mapped[str | None] = mapped_column(ForeignKey("resellers.id"))
    company_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Admin-created accounts start as account_state="invited" (no password, email
    # unverified) until the user completes First-time login.
    invited_at: Mapped[datetime | None] = mapped_column(DateTime)
    invited_by: Mapped[str | None] = mapped_column(String(255))

    assigned_systems: Mapped[list["UserAssignedSystem"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    assigned_sites: Mapped[list["UserAssignedSite"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def assigned_system_ids(self) -> list[str]:
        return [assignment.system_id for assignment in self.assigned_systems]

    @property
    def assigned_site_ids(self) -> list[str]:
        return [assignment.site_id for assignment in self.assigned_sites]


class AuthOtp(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "auth_otps"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(30), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime)


class UserAssignedSystem(Base, UUIDPKMixin):
    __tablename__ = "user_assigned_systems"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    system_id: Mapped[str] = mapped_column(ForeignKey("systems.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="assigned_systems")


class UserAssignedSite(Base, UUIDPKMixin):
    __tablename__ = "user_assigned_sites"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="assigned_sites")
