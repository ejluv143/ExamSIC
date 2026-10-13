import { Layer } from "effect";
import { ClassroomService } from "./Classroom.ts";
import { EnrollmentService } from "./Enrollment.ts";
import { Handlers } from "./Handlers.ts";
import { ClassRepo } from "./Repo.ts";
import { ClassService } from "./Service.ts";

// Classes, enrollment and Google Classroom; `ClassService` (class ownership) is also used by attendance and records.
export const Repo = ClassRepo.layer;
export const Services = Layer.mergeAll(EnrollmentService.layer, ClassroomService.layer).pipe(Layer.provideMerge(ClassService.layer));
export const Live = Handlers;
