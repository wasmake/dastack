import { PERMISSIONS } from "@/features/organizations/permissions";
import { requireOrganizationPermission } from "@/server/authorization";
import {
  ResourceEntitlementModel,
  type ResourceEntitlementRecord,
} from "@/server/db/control-plane-models";
import { AppError } from "@/server/security/errors";

export function serializeEntitlement(entitlement: ResourceEntitlementRecord) {
  return {
    id: entitlement._id.toString(),
    organizationId: entitlement.organizationId.toString(),
    status: entitlement.status,
    billingStatus: entitlement.billingStatus,
    validFrom: entitlement.validFrom,
    validUntil: entitlement.validUntil,
    limits: entitlement.limits,
    reserved: entitlement.reserved,
    allocated: entitlement.allocated,
    version: entitlement.__v,
  };
}

export async function getResourceEntitlement(
  organizationId: string,
  userId: string,
) {
  await requireOrganizationPermission(
    userId,
    organizationId,
    PERMISSIONS.BILLING_READ,
  );
  const entitlement = await ResourceEntitlementModel.findOne({
    organizationId,
  }).lean<ResourceEntitlementRecord>();
  if (!entitlement) {
    throw new AppError(
      404,
      "ENTITLEMENT_NOT_FOUND",
      "The resource entitlement was not found.",
    );
  }
  return serializeEntitlement(entitlement);
}
