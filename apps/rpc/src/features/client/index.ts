import { Attestation } from "./Attestation.ts";
import { ClientHandlers } from "./Handlers.ts";

// Device attestation for the native apps; `Attestation` is also used by attempt, to mark an attempt as verified.
export const Services = Attestation.layer;
export const Live = ClientHandlers;
