from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin

# Role values: superadmin | reseller_admin | company_admin | system_operator | system_viewer
# scope_type only matters for system_operator/system_viewer: company_wide | assigned
ROLES = ("superadmin", "reseller_admin", "company_admin", "system_operator", "system_viewer")
SCOPE_TYPES = ("company_wide", "assigned")


class User(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "users"

    zitadel_sub: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    # NULL role = auto-provisioned, unprivileged until a superadmin/admin assigns one.
    role: Mapped[str | None] = mapped_column(String(30))
    scope_type: Mapped[str | None] = mapped_column(String(20))
    reseller_id: Mapped[str | None] = mapped_column(ForeignKey("resellers.id"))
    company_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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
