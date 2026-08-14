import type { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type { ChallengeQueryDto, ChallengeSortField } from '../dtos/ChallengeQueryDto';
import type { OwnedChallengeQueryDto } from '../dtos/ChallengeQueryDto';
import type { CreateChallengeDto } from '../dtos/CreateChallengeDto';
import type { UpdateChallengeDto } from '../dtos/UpdateChallengeDto';
import { Challenge, ChallengeStatus } from '../entities/Challenge';
import type { ChallengeCategory } from '../entities/Challenge';
import { ChallengeParticipation } from '../entities/ChallengeParticipation';
import { Role } from '../entities/User';
import type { AuthContext } from '../middlewares/auth.middleware';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/AppError';
import { daysBetween, today } from '../utils/date';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';
import { assertSystemTransition, assertTransition, MATERIAL_FIELDS } from './ChallengeStateMachine';

/**
 * A challenge as the API describes it.
 *
 * `participantCount`, `isFull`, and `hasEnded` are computed per response, never stored. A cached count on
 * the row would have to be kept in step with every join, and the one that drifts is the one capacity is
 * enforced against.
 */
export interface ChallengeSummary {
  id: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  startDate: string;
  endDate: string;
  capacity: number;
  participantCount: number;
  isFull: boolean;
  hasEnded: boolean;
  pointsReward: number;
  coverImage: string | null;
  status: ChallengeStatus;
  rejectionReason: string | null;
  creator: { id: string; displayName: string };
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Columns a list may be ordered by, mapped from the validated `sortBy` values.
 *
 * The indirection is the point: a value from the query string never reaches an ORDER BY clause, only a
 * key used to look one up.
 */
const SORT_COLUMNS: Record<ChallengeSortField, string> = {
  startDate: 'challenge.startDate',
  endDate: 'challenge.endDate',
  pointsReward: 'challenge.pointsReward',
  capacity: 'challenge.capacity',
  title: 'challenge.title',
  createdAt: 'challenge.createdAt',
};

/** Statuses a challenge may be edited in. PENDING_APPROVAL is under review; ENDED is history. */
const EDITABLE_STATUSES = [
  ChallengeStatus.DRAFT,
  ChallengeStatus.REJECTED,
  ChallengeStatus.APPROVED,
];

/** Statuses a challenge may be deleted in — the two the specification names. */
const DELETABLE_STATUSES = [ChallengeStatus.DRAFT, ChallengeStatus.REJECTED];

/**
 * The challenge lifecycle, browse, and Creator ownership rules.
 *
 * Every status change goes through `ChallengeStateMachine`. Ownership is checked here instead, because it
 * depends on the row: whether an actor may act is a fact about this challenge, not about the transition.
 */
export class ChallengeService {
  constructor(private readonly dataSource: DataSource) {}

  private get challenges(): Repository<Challenge> {
    return this.dataSource.getRepository(Challenge);
  }

  private get participations(): Repository<ChallengeParticipation> {
    return this.dataSource.getRepository(ChallengeParticipation);
  }

  // ---------------------------------------------------------------- Creator

  async create(
    actor: AuthContext,
    input: CreateChallengeDto,
    coverImage: string | null,
  ): Promise<ChallengeSummary> {
    assertWindow(input.startDate, input.endDate);

    const challenge = await this.challenges.save(
      this.challenges.create({
        ...input,
        coverImage,
        // Not taken from the request. A challenge always begins as a draft; accepting a status here would
        // be a way to publish without review.
        status: ChallengeStatus.DRAFT,
        createdById: actor.userId,
      }),
    );

    return this.getOwned(actor, challenge.id);
  }

  /**
   * Applies an edit, and re-enters approval if the edit was material.
   *
   * A challenge under review cannot be edited — the Creator would be changing what an Admin is in the
   * middle of reading. An ended one cannot either: participants earned points against its terms.
   */
  async update(
    actor: AuthContext,
    id: string,
    input: UpdateChallengeDto,
    coverImage: string | null,
  ): Promise<ChallengeSummary> {
    const challenge = await this.requireOwned(actor, id);

    if (!EDITABLE_STATUSES.includes(challenge.status)) {
      throw new ForbiddenError(
        challenge.status === ChallengeStatus.PENDING_APPROVAL
          ? 'This challenge is awaiting review and cannot be edited until an Admin responds'
          : 'An ended challenge cannot be edited',
      );
    }

    assertWindow(input.startDate ?? challenge.startDate, input.endDate ?? challenge.endDate);
    await this.assertCapacityFitsParticipants(challenge, input.capacity);

    const materialChanges = MATERIAL_FIELDS.filter((field) => {
      const next: unknown = input[field];
      const current: unknown = challenge[field];
      return next !== undefined && next !== current;
    });

    // Assigned field by field rather than with Object.assign: a DTO instance carries every declared
    // property, absent ones as `undefined`, so a blanket copy would erase what the caller did not send.
    if (input.title !== undefined) challenge.title = input.title;
    if (input.description !== undefined) challenge.description = input.description;
    if (input.category !== undefined) challenge.category = input.category;
    if (input.startDate !== undefined) challenge.startDate = input.startDate;
    if (input.endDate !== undefined) challenge.endDate = input.endDate;
    if (input.capacity !== undefined) challenge.capacity = input.capacity;
    if (input.pointsReward !== undefined) challenge.pointsReward = input.pointsReward;
    if (coverImage !== null) challenge.coverImage = coverImage;

    if (challenge.status === ChallengeStatus.APPROVED && materialChanges.length > 0) {
      assertTransition(ChallengeStatus.APPROVED, ChallengeStatus.PENDING_APPROVAL, actor.role);
      challenge.status = ChallengeStatus.PENDING_APPROVAL;
      // The previous approval no longer applies to what this challenge now says.
      challenge.approvedById = null;
      challenge.approvedAt = null;
    }

    await this.challenges.save(challenge);
    return this.getOwned(actor, challenge.id);
  }

  async submitForApproval(actor: AuthContext, id: string): Promise<ChallengeSummary> {
    const challenge = await this.requireOwned(actor, id);

    assertTransition(challenge.status, ChallengeStatus.PENDING_APPROVAL, actor.role);
    assertWindow(challenge.startDate, challenge.endDate);

    challenge.status = ChallengeStatus.PENDING_APPROVAL;
    // A resubmission is answering the previous rejection, so that reason no longer describes the row.
    challenge.rejectionReason = null;

    await this.challenges.save(challenge);
    return this.getOwned(actor, challenge.id);
  }

  async remove(actor: AuthContext, id: string): Promise<void> {
    const challenge = await this.requireOwned(actor, id);

    if (!DELETABLE_STATUSES.includes(challenge.status)) {
      throw new ForbiddenError('Only a draft or rejected challenge can be deleted');
    }

    // Belt and braces: a draft was never visible so it should have no participants, but deleting a row
    // that does would fail on the foreign key as a 500 rather than saying why.
    const participants = await this.participations.countBy({ challengeId: id });
    if (participants > 0) {
      throw new ConflictError('This challenge has participants and cannot be deleted');
    }

    await this.challenges.delete(id);
  }

  async listOwn(
    actor: AuthContext,
    query: OwnedChallengeQueryDto,
  ): Promise<Page<ChallengeSummary>> {
    await this.closeExpiredChallenges();

    const builder = this.baseQuery(query).andWhere('challenge.createdById = :ownerId', {
      ownerId: actor.userId,
    });

    if (query.status !== undefined) {
      builder.andWhere('challenge.status = :status', { status: query.status });
    }

    return this.paginate(builder, query);
  }

  // ------------------------------------------------------------------ Admin

  /** The approval queue. */
  async listByStatus(
    status: ChallengeStatus,
    query: ChallengeQueryDto,
  ): Promise<Page<ChallengeSummary>> {
    await this.closeExpiredChallenges();

    return this.paginate(
      this.baseQuery(query).andWhere('challenge.status = :status', { status }),
      query,
    );
  }

  async approve(actor: AuthContext, id: string): Promise<ChallengeSummary> {
    const challenge = await this.findOrFail(id);

    // The Creator's own role is never ADMIN, so this one call is what prevents self-approval.
    assertTransition(challenge.status, ChallengeStatus.APPROVED, actor.role);

    challenge.status = ChallengeStatus.APPROVED;
    challenge.approvedById = actor.userId;
    challenge.approvedAt = new Date();
    challenge.rejectionReason = null;

    await this.challenges.save(challenge);
    return this.toSummaryById(challenge.id);
  }

  async reject(actor: AuthContext, id: string, reason: string): Promise<ChallengeSummary> {
    const challenge = await this.findOrFail(id);

    assertTransition(challenge.status, ChallengeStatus.REJECTED, actor.role);

    challenge.status = ChallengeStatus.REJECTED;
    challenge.rejectionReason = reason;
    challenge.approvedById = null;
    challenge.approvedAt = null;

    await this.challenges.save(challenge);
    return this.toSummaryById(challenge.id);
  }

  // ------------------------------------------------------------------- User

  /**
   * The public browse. Approved challenges only — nothing else has ever been visible to a User, which is
   * the point of the approval workflow.
   *
   * `dateFrom`/`dateTo` select challenges whose window *overlaps* the requested range, which is what
   * "challenges running in September" means. Filtering on `startDate` alone would hide a challenge that
   * began in August and is still running.
   */
  async listApproved(query: ChallengeQueryDto): Promise<Page<ChallengeSummary>> {
    await this.closeExpiredChallenges();

    return this.paginate(
      this.baseQuery(query).andWhere('challenge.status = :status', {
        status: ChallengeStatus.APPROVED,
      }),
      query,
    );
  }

  /**
   * A single challenge, subject to who is asking.
   *
   * An Admin sees anything. A Creator sees their own at any status, plus anything published. A User sees
   * only what has been published. Anything else is reported as absent rather than forbidden — a 403 would
   * confirm that a draft with that id exists.
   */
  async getForActor(actor: AuthContext, id: string): Promise<ChallengeSummary> {
    const challenge = await this.findOrFail(id);

    const published =
      challenge.status === ChallengeStatus.APPROVED || challenge.status === ChallengeStatus.ENDED;
    const visible =
      actor.role === Role.ADMIN || published || challenge.createdById === actor.userId;

    if (!visible) {
      throw new NotFoundError('No challenge with that id');
    }

    return this.toSummaryById(id);
  }

  /**
   * Summaries for a set of ids, for callers that already know which challenges they need.
   *
   * `ParticipationService` uses this to describe the challenges behind a user's participations, rather than
   * rebuilding the summary shape and the participant count itself.
   */
  async summarizeByIds(challengeIds: string[]): Promise<Map<string, ChallengeSummary>> {
    if (challengeIds.length === 0) return new Map();

    const challenges = await this.challenges
      .createQueryBuilder('challenge')
      .innerJoin('challenge.createdBy', 'creator')
      .addSelect(['creator.id', 'creator.displayName'])
      .where('challenge.id IN (:...challengeIds)', { challengeIds })
      .getMany();

    const counts = await this.countParticipants(challengeIds);

    return new Map(
      challenges.map((challenge) => [
        challenge.id,
        toSummary(challenge, counts.get(challenge.id) ?? 0),
      ]),
    );
  }

  // ---------------------------------------------------------------- Internal

  /**
   * Moves approved challenges whose window has closed to ENDED.
   *
   * There is no scheduler in this project, so this runs at the start of each list read. It is one UPDATE
   * whose WHERE matches nothing on all but the first call after a day rolls over, and it goes through the
   * state machine like every other transition.
   *
   * Correctness never depends on it having run: joining and checking in both validate against the actual
   * date window, so a challenge that is briefly still marked APPROVED past its end date cannot be joined
   * or checked into. The sweep is what keeps the *displayed* status honest.
   */
  async closeExpiredChallenges(): Promise<number> {
    assertSystemTransition(ChallengeStatus.APPROVED, ChallengeStatus.ENDED);

    const result = await this.challenges
      .createQueryBuilder()
      .update(Challenge)
      .set({ status: ChallengeStatus.ENDED })
      .where('status = :approved', { approved: ChallengeStatus.APPROVED })
      .andWhere('end_date < CURRENT_DATE')
      .execute();

    return result.affected ?? 0;
  }

  /**
   * The shared filter set — the graded search capability, implemented once.
   *
   * Only `id` and `displayName` are selected from the creator. A challenge listing has no business
   * carrying the author's bio, and `passwordHash` is excluded by the column's own `select: false`.
   */
  private baseQuery(query: ChallengeQueryDto): SelectQueryBuilder<Challenge> {
    const builder = this.challenges
      .createQueryBuilder('challenge')
      .innerJoin('challenge.createdBy', 'creator')
      .addSelect(['creator.id', 'creator.displayName']);

    if (query.keyword !== undefined) {
      builder.andWhere('(challenge.title ILIKE :keyword OR challenge.description ILIKE :keyword)', {
        keyword: `%${escapeLikePattern(query.keyword)}%`,
      });
    }

    if (query.category !== undefined) {
      builder.andWhere('challenge.category = :category', { category: query.category });
    }

    // Overlap, not containment: ends on or after the start of the range, begins on or before its end.
    if (query.dateFrom !== undefined) {
      builder.andWhere('challenge.endDate >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo !== undefined) {
      builder.andWhere('challenge.startDate <= :dateTo', { dateTo: query.dateTo });
    }

    if (query.availableOnly === true) {
      builder
        .andWhere('challenge.endDate >= CURRENT_DATE')
        .andWhere(
          '(SELECT COUNT(*) FROM challenge_participations p WHERE p.challenge_id = challenge.id) < challenge.capacity',
        );
    }

    return builder;
  }

  private async paginate(
    builder: SelectQueryBuilder<Challenge>,
    query: ChallengeQueryDto,
  ): Promise<Page<ChallengeSummary>> {
    const request = toPageRequest(query);

    builder
      .orderBy(SORT_COLUMNS[query.sortBy ?? 'startDate'], query.sortDir ?? 'ASC')
      // A deterministic tiebreak. Without it, rows sharing a sort value can be ordered differently
      // between two pages, so one row appears twice and another never appears at all.
      .addOrderBy('challenge.id', 'ASC')
      .skip(request.skip)
      .take(request.take);

    const [challenges, total] = await builder.getManyAndCount();
    const counts = await this.countParticipants(challenges.map((challenge) => challenge.id));

    return toPage(
      challenges.map((challenge) => toSummary(challenge, counts.get(challenge.id) ?? 0)),
      total,
      request,
    );
  }

  /**
   * Participant counts for the page just fetched.
   *
   * A second small query rather than a subquery folded into the select, which would mean reading raw rows
   * and stitching them back onto entities by alias. The page is at most `MAX_PAGE_SIZE` ids, and this keeps
   * `Challenge` free of properties that are not columns.
   */
  private async countParticipants(challengeIds: string[]): Promise<Map<string, number>> {
    if (challengeIds.length === 0) return new Map();

    const rows = await this.participations
      .createQueryBuilder('participation')
      .select('participation.challengeId', 'challengeId')
      .addSelect('COUNT(*)', 'count')
      .where('participation.challengeId IN (:...challengeIds)', { challengeIds })
      .groupBy('participation.challengeId')
      .getRawMany<{ challengeId: string; count: string }>();

    return new Map(rows.map((row) => [row.challengeId, Number(row.count)]));
  }

  private async findOrFail(id: string): Promise<Challenge> {
    const challenge = await this.challenges.findOneBy({ id });

    if (!challenge) {
      throw new NotFoundError('No challenge with that id');
    }

    return challenge;
  }

  private async requireOwned(actor: AuthContext, id: string): Promise<Challenge> {
    const challenge = await this.findOrFail(id);

    // Admins govern challenges but do not author them, so this excludes them too. Approving and rejecting
    // are the Admin's levers, and they run through the state machine instead.
    if (challenge.createdById !== actor.userId) {
      throw new ForbiddenError('This challenge belongs to another creator');
    }

    return challenge;
  }

  /** Loads a challenge the actor owns and shapes it for a response. */
  private async getOwned(actor: AuthContext, id: string): Promise<ChallengeSummary> {
    await this.requireOwned(actor, id);
    return this.toSummaryById(id);
  }

  private async toSummaryById(id: string): Promise<ChallengeSummary> {
    const challenge = await this.challenges
      .createQueryBuilder('challenge')
      .innerJoin('challenge.createdBy', 'creator')
      .addSelect(['creator.id', 'creator.displayName'])
      .where('challenge.id = :id', { id })
      .getOne();

    if (!challenge) {
      throw new NotFoundError('No challenge with that id');
    }

    return toSummary(challenge, await this.participations.countBy({ challengeId: id }));
  }

  /**
   * Refuses a capacity that is already exceeded.
   *
   * A business invariant, so it lives here rather than in the DTO: whether 10 is a legal capacity depends on
   * how many people have already joined, which the validator cannot know.
   */
  private async assertCapacityFitsParticipants(
    challenge: Challenge,
    capacity: number | undefined,
  ): Promise<void> {
    if (capacity === undefined || capacity >= challenge.capacity) return;

    const participants = await this.participations.countBy({ challengeId: challenge.id });
    if (capacity < participants) {
      throw new ConflictError(
        `Capacity cannot be reduced to ${capacity}: ${participants} people have already joined`,
      );
    }
  }
}

/**
 * `endDate > startDate` — the same rule the database enforces with a check constraint.
 *
 * Checked here as well so a caller gets a 400 that names the problem. Relying on the constraint alone would
 * surface it as an unhandled query failure and a generic 500.
 */
function assertWindow(startDate: string, endDate: string): void {
  if (daysBetween(startDate, endDate) < 1) {
    throw new ValidationError('endDate must be after startDate');
  }
}

/**
 * Escapes the wildcards in a keyword before it is wrapped in `%…%`.
 *
 * Without this, a search for `50%` matches everything, and `_` quietly matches any character. PostgreSQL's
 * default LIKE escape is the backslash, so no ESCAPE clause is needed.
 */
function escapeLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function toSummary(challenge: Challenge, participantCount: number): ChallengeSummary {
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    category: challenge.category,
    startDate: challenge.startDate,
    endDate: challenge.endDate,
    capacity: challenge.capacity,
    participantCount,
    isFull: participantCount >= challenge.capacity,
    hasEnded: challenge.endDate < today(),
    pointsReward: challenge.pointsReward,
    coverImage: challenge.coverImage,
    status: challenge.status,
    rejectionReason: challenge.rejectionReason,
    creator: {
      id: challenge.createdBy.id,
      displayName: challenge.createdBy.displayName,
    },
    approvedAt: challenge.approvedAt,
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
  };
}

export const challengeService = new ChallengeService(AppDataSource);
