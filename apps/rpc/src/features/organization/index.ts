import { OrganizationHandlers } from "./Handlers.ts";
import { OrganizationRepo } from "./Repo.ts";
import { OrganizationService } from "./Service.ts";

// Organizations, memberships, invite codes and custom roles (see main.ts for how Repo, Services and Live fit together).
export const Repo = OrganizationRepo.layer;
export const Services = OrganizationService.layer;
export const Live = OrganizationHandlers;
