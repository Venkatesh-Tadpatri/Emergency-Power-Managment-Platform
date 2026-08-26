export const ROLE_LABEL = {
  superadmin: "Super Admin",
  reseller_admin: "Reseller Admin",
  company_admin: "Customer Admin",
  system_operator: "System Operator",
  system_viewer: "System Viewer",
};

export const roleName = (role) => ROLE_LABEL[role] || "Pending role assignment";
