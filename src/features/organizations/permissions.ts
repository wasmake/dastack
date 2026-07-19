export const PERMISSIONS = {
  ORGANIZATION_READ: "organization:read",
  ORGANIZATION_UPDATE: "organization:update",
  ORGANIZATION_DELETE: "organization:delete",
  MEMBER_LIST: "member:list",
  MEMBER_INVITE: "member:invite",
  MEMBER_UPDATE: "member:update",
  MEMBER_REMOVE: "member:remove",
  ROLE_LIST: "role:list",
  ROLE_MANAGE: "role:manage",
  PROJECT_VIEW: "project:view",
  PROJECT_CREATE: "project:create",
  ENVIRONMENT_MANAGE: "environment:manage",
  SERVICE_CREATE: "service:create",
  SERVICE_UPDATE: "service:update",
  SERVICE_DELETE: "service:delete",
  SERVICE_LIFECYCLE: "service:lifecycle",
  SERVICE_LOGS_READ: "service:logs:read",
  SERVICE_TERMINAL_ACCESS: "service:terminal:access",
  BACKUP_MANAGE: "backup:manage",
  DOMAIN_MANAGE: "domain:manage",
  INGRESS_MANAGE: "ingress:manage",
  PUBLIC_IP_MANAGE: "public-ip:manage",
  SECRET_MANAGE: "secret:manage",
  SECRET_REVEAL: "secret:reveal",
  BILLING_READ: "billing:read",
  BILLING_MANAGE: "billing:manage",
  USAGE_VIEW: "usage:view",
  AUDIT_VIEW: "audit:view",
  WORKER_MANAGE: "worker:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type BuiltInRoleKey =
  "owner" | "admin" | "developer" | "billing" | "viewer";

const allPermissions = Object.values(PERMISSIONS);

export const BUILT_IN_ROLES: ReadonlyArray<{
  key: BuiltInRoleKey;
  name: string;
  permissions: readonly Permission[];
}> = [
  { key: "owner", name: "Owner", permissions: allPermissions },
  {
    key: "admin",
    name: "Admin",
    permissions: [
      PERMISSIONS.ORGANIZATION_READ,
      PERMISSIONS.ORGANIZATION_UPDATE,
      PERMISSIONS.MEMBER_LIST,
      PERMISSIONS.MEMBER_INVITE,
      PERMISSIONS.MEMBER_UPDATE,
      PERMISSIONS.MEMBER_REMOVE,
      PERMISSIONS.ROLE_LIST,
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.ENVIRONMENT_MANAGE,
      PERMISSIONS.SERVICE_CREATE,
      PERMISSIONS.SERVICE_UPDATE,
      PERMISSIONS.SERVICE_DELETE,
      PERMISSIONS.SERVICE_LIFECYCLE,
      PERMISSIONS.SERVICE_LOGS_READ,
      PERMISSIONS.SERVICE_TERMINAL_ACCESS,
      PERMISSIONS.BACKUP_MANAGE,
      PERMISSIONS.DOMAIN_MANAGE,
      PERMISSIONS.INGRESS_MANAGE,
      PERMISSIONS.PUBLIC_IP_MANAGE,
      PERMISSIONS.SECRET_MANAGE,
      PERMISSIONS.SECRET_REVEAL,
      PERMISSIONS.BILLING_READ,
      PERMISSIONS.USAGE_VIEW,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.WORKER_MANAGE,
    ],
  },
  {
    key: "developer",
    name: "Developer",
    permissions: [
      PERMISSIONS.ORGANIZATION_READ,
      PERMISSIONS.MEMBER_LIST,
      PERMISSIONS.ROLE_LIST,
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.ENVIRONMENT_MANAGE,
      PERMISSIONS.SERVICE_CREATE,
      PERMISSIONS.SERVICE_UPDATE,
      PERMISSIONS.SERVICE_DELETE,
      PERMISSIONS.SERVICE_LIFECYCLE,
      PERMISSIONS.SERVICE_LOGS_READ,
      PERMISSIONS.SERVICE_TERMINAL_ACCESS,
      PERMISSIONS.BACKUP_MANAGE,
      PERMISSIONS.DOMAIN_MANAGE,
      PERMISSIONS.INGRESS_MANAGE,
      PERMISSIONS.SECRET_MANAGE,
      PERMISSIONS.SECRET_REVEAL,
      PERMISSIONS.USAGE_VIEW,
    ],
  },
  {
    key: "billing",
    name: "Billing",
    permissions: [
      PERMISSIONS.ORGANIZATION_READ,
      PERMISSIONS.MEMBER_LIST,
      PERMISSIONS.BILLING_READ,
      PERMISSIONS.BILLING_MANAGE,
      PERMISSIONS.USAGE_VIEW,
    ],
  },
  {
    key: "viewer",
    name: "Viewer",
    permissions: [
      PERMISSIONS.ORGANIZATION_READ,
      PERMISSIONS.MEMBER_LIST,
      PERMISSIONS.ROLE_LIST,
      PERMISSIONS.PROJECT_VIEW,
      PERMISSIONS.SERVICE_LOGS_READ,
      PERMISSIONS.BILLING_READ,
      PERMISSIONS.USAGE_VIEW,
      PERMISSIONS.AUDIT_VIEW,
    ],
  },
] as const;

export function roleHasPermission(
  rolePermissions: readonly string[],
  permission: Permission,
): boolean {
  return rolePermissions.includes(permission);
}
