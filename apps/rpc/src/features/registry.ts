import { Layer } from "effect";
import { AdminHandlers } from "./admin/Handlers.ts";
import { AdminRepo } from "./admin/Repo.ts";
import { AdminService } from "./admin/Service.ts";
import { AiHandlers } from "./ai/Handlers.ts";
import { AiRepo } from "./ai/Repo.ts";
import { Ai } from "./ai/Service.ts";
import { AssetHandlers } from "./assets/Handlers.ts";
import { AssetCleanup } from "./assets/Jobs.ts";
import { AssetRepo } from "./assets/Repo.ts";
import { Assets } from "./assets/Service.ts";
import { Coach } from "./attempt/Coach.ts";
import { AttemptHandlers } from "./attempt/Handlers.ts";
import { AttemptRepo } from "./attempt/Repo.ts";
import { Results } from "./attempt/Results.ts";
import { Saving } from "./attempt/Saving.ts";
import { AttemptService } from "./attempt/Service.ts";
import { Taking } from "./attempt/Taking.ts";
import { AttendanceHandlers } from "./attendance/Handlers.ts";
import { AttendanceRepo } from "./attendance/Repo.ts";
import { AttendanceService } from "./attendance/Service.ts";
import { BetterAuth } from "./auth/BetterAuth.ts";
import { Handlers as AuthHandlers } from "./auth/Handlers.ts";
import { SessionIdentity } from "./auth/Identity.ts";
import { AuthRepo } from "./auth/Repo.ts";
import { AuthService } from "./auth/Service.ts";
import { AuthMiddlewareLive } from "./auth/Session.ts";
import { BankHandlers } from "./bank/Handlers.ts";
import { BankRepo } from "./bank/Repo.ts";
import { BankService } from "./bank/Service.ts";
import { ClassroomService } from "./classes/Classroom.ts";
import { EnrollmentService } from "./classes/Enrollment.ts";
import { Handlers as ClassHandlers } from "./classes/Handlers.ts";
import { ClassRepo } from "./classes/Repo.ts";
import { ClassService } from "./classes/Service.ts";
import { Attestation } from "./client/Attestation.ts";
import { ClientHandlers } from "./client/Handlers.ts";
import { ExamHandlers } from "./exam/Handlers.ts";
import { ExamRepo } from "./exam/Repo.ts";
import { ExamService } from "./exam/Service.ts";
import { GameHandlers } from "./game/Handlers.ts";
import { GameTicker } from "./game/Jobs.ts";
import { GameRepo } from "./game/Repo.ts";
import { RoomStore } from "./game/RoomStore.ts";
import { Game } from "./game/Service.ts";
import { GameViews } from "./game/Views.ts";
import { LiveAuthMiddlewareLive, LiveHandlers, LiveTicketHandlers } from "./live/Handlers.ts";
import { LiveRepo } from "./live/Repo.ts";
import { LiveHub } from "./live/Service.ts";
import { MasteryHandlers } from "./mastery/Handlers.ts";
import { MasteryRepo } from "./mastery/Repo.ts";
import { MasteryService } from "./mastery/Service.ts";
import { Membership } from "./organization/Membership.ts";
import { OrganizationHandlers } from "./organization/Handlers.ts";
import { OrganizationRepo } from "./organization/Repo.ts";
import { OrganizationService } from "./organization/Service.ts";
import { QuizHandlers } from "./quiz/Handlers.ts";
import { QuizRepo } from "./quiz/Repo.ts";
import { QuizService } from "./quiz/Service.ts";
import { ClassRecordHandlers } from "./records/Handlers.ts";
import { RecordsRepo } from "./records/Repo.ts";
import { RecordsService } from "./records/Service.ts";
import { SessionHandlers } from "./session/Handlers.ts";
import { QuizSweep } from "./session/Jobs.ts";
import { SessionLifecycle } from "./session/Lifecycle.ts";
import { SessionLiveActions } from "./session/LiveActions.ts";
import { SessionReports } from "./session/Reports.ts";
import { SessionRepo } from "./session/Repo.ts";
import { SessionService } from "./session/Service.ts";

// What a feature contributes to the server, declared once here:
// - `repo`: its database access;
// - `services`: its services, which other features may use too;
// - `handlers`: its RPC handlers, middleware and background jobs.
const feature = <Repo extends Layer.Layer<never, any, any>, Services extends Layer.Layer<never, any, any>, Handlers extends Layer.Layer<never, any, any>>(parts: {
  repo: Repo;
  services: Services;
  handlers: Handlers;
}) => parts;

// Accounts, sessions and avatars, and the auth middleware every other RPC group uses. `SessionIdentity` (who is making
// a request) and `BetterAuth` (also used by admin and classes for Google Classroom tokens) are services of this feature.
const auth = feature({
  repo: AuthRepo.layer,
  services: AuthService.layer.pipe(Layer.provideMerge(SessionIdentity.layer), Layer.provideMerge(BetterAuth.layer)),
  handlers: Layer.mergeAll(AuthHandlers, AuthMiddlewareLive),
});
// Organizations, memberships, invite codes and custom roles.
const organization = feature({
  repo: OrganizationRepo.layer,
  services: OrganizationService.layer.pipe(Layer.provideMerge(Membership.layer)),
  handlers: OrganizationHandlers,
});
const admin = feature({ repo: AdminRepo.layer, services: AdminService.layer, handlers: AdminHandlers });
// The ai.* RPCs; `Ai` is also used by attempt.coach.
const ai = feature({ repo: AiRepo.layer, services: Ai.layer, handlers: AiHandlers });
// The asset.* RPCs and the daily cleanup; `Assets` is also used by attempt, game and mastery.
const assets = feature({ repo: AssetRepo.layer, services: Assets.layer, handlers: Layer.mergeAll(AssetHandlers, AssetCleanup) });
// Taking, saving, results and coach; `AttemptService` (submit, ownership checks) is also used by session, game and mastery.
const attempt = feature({
  repo: AttemptRepo.layer,
  services: Layer.mergeAll(Taking.layer, Saving.layer, Coach.layer).pipe(
    Layer.provideMerge(Results.layer),
    Layer.provideMerge(AttemptService.layer),
  ),
  handlers: AttemptHandlers,
});
const attendance = feature({ repo: AttendanceRepo.layer, services: AttendanceService.layer, handlers: AttendanceHandlers });
const bank = feature({ repo: BankRepo.layer, services: BankService.layer, handlers: BankHandlers });
// Classes, enrollment and Google Classroom; `ClassService` (class ownership) is also used by attendance and records.
const classes = feature({
  repo: ClassRepo.layer,
  services: Layer.mergeAll(EnrollmentService.layer, ClassroomService.layer).pipe(Layer.provideMerge(ClassService.layer)),
  handlers: ClassHandlers,
});
// Device attestation for the native apps; `Attestation` is also used by attempt, to mark an attempt as verified.
const client = feature({ repo: Layer.empty, services: Attestation.layer, handlers: ClientHandlers });
// Exam mode: allowing a student back in, retakes and the exam record. The attempt feature reads granted retakes from ExamRepo.
const exam = feature({ repo: ExamRepo.layer, services: ExamService.layer, handlers: ExamHandlers });
// The rooms in memory, what each screen sees, and the game flow on top. One `Game` for the whole API, so auth, session
// and live see the same rooms.
const game = feature({
  repo: GameRepo.layer,
  services: Game.layer.pipe(Layer.provideMerge(GameViews.layer), Layer.provideMerge(RoomStore.layer)),
  handlers: Layer.mergeAll(GameHandlers, GameTicker),
});
// Tickets, the live streams and the middleware that checks tickets; `LiveHub` is used by most features.
const live = feature({
  repo: LiveRepo.layer,
  services: LiveHub.layer,
  handlers: Layer.mergeAll(LiveTicketHandlers, LiveHandlers, LiveAuthMiddlewareLive),
});
const mastery = feature({ repo: MasteryRepo.layer, services: MasteryService.layer, handlers: MasteryHandlers });
const quiz = feature({ repo: QuizRepo.layer, services: QuizService.layer, handlers: QuizHandlers });
const records = feature({ repo: RecordsRepo.layer, services: RecordsService.layer, handlers: ClassRecordHandlers });
// Session lifecycle, live actions and reports, and the sweep that opens, ends and submits on schedule.
const session = feature({
  repo: SessionRepo.layer,
  services: Layer.mergeAll(SessionLifecycle.layer, SessionLiveActions.layer, SessionReports.layer).pipe(
    Layer.provideMerge(SessionService.layer),
  ),
  handlers: Layer.mergeAll(SessionHandlers, QuizSweep),
});

// Start-up order: a feature's services are built after the services of every feature in the tiers below it, so list
// a feature above the ones it uses (the first tier uses everything, the last uses only repos and the platform). Features
// in one tier don't use each other. A feature's services and its handlers can't come as one layer: live's handlers stream
// game views while the game publishes through LiveHub.
const tiers = [
  [admin, records, attendance],
  [classes],
  [organization],
  [auth],
  [session, mastery],
  [game],
  [attempt],
  [exam],
  [live, ai, assets, bank, client, quiz],
] as const;

type Feature = (typeof tiers)[number][number];
type Features = [Feature, ...Feature[]];

const mergeAll = <L extends Layer.Layer<never, any, any>>(layers: [L, ...L[]]) => Layer.mergeAll(...layers);

const everyFeature = tiers.flat() as unknown as Features;

type Repo = Feature["repo"];
type Service = Feature["services"];

// The services of all features with their repos, tier by tier; each tier gets what the tiers after it provide. What
// remains required is the platform (database, cache, rate limiter ...) and the app config.
export const Services = ([
  ...tiers.map((tier) => mergeAll(tier.map((f) => f.services) as [Service, ...Service[]])),
  mergeAll(everyFeature.map((f) => f.repo) as [Repo, ...Repo[]]),
] as Array<Layer.Layer<any, any, any>>).reduce((above, below) => Layer.provideMerge(above, below)) as Layer.Layer<
  Layer.Success<Service> | Layer.Success<Repo>,
  Layer.Error<Service> | Layer.Error<Repo>,
  Exclude<Layer.Services<Service> | Layer.Services<Repo>, Layer.Success<Service> | Layer.Success<Repo>>
>;

type Handler = Feature["handlers"];

// Every feature's RPC handlers, middleware and jobs.
export const Handlers = mergeAll(everyFeature.map((f) => f.handlers) as [Handler, ...Handler[]]);
