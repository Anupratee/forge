import type { DataSource, EntityManager, Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import type { CheckInDto } from '../dtos/CheckInDto';
import type { ListQueryDto } from '../dtos/ListQueryDto';
import { Challenge, ChallengeStatus } from '../entities/Challenge';
import { ChallengeCheckIn } from '../entities/ChallengeCheckIn';
import { ChallengeParticipation, ParticipationStatus } from '../entities/ChallengeParticipation';
import { PointsReason, PointsReferenceType } from '../entities/PointsLedger';
import type { AuthContext } from '../middlewares/auth.middleware';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/AppError';
import { isUniqueViolation } from '../utils/database';
import { daysBetween, today } from '../utils/date';
import { toPage, toPageRequest } from '../utils/pagination';
import type { Page } from '../utils/pagination';
import type { ChallengeSummary } from './ChallengeService';
import { challengeService } from './ChallengeService';
import { PointsPolicy } from './PointsPolicy';
import { pointsService } from './PointsService';
import type { ChallengeService } from './ChallengeService';
import type { PointsService } from './PointsService';

/** How far through a challenge one participant is. */
export interface ParticipationProgress {
  id: string;
  status: ParticipationStatus;
  joinedAt: Date;
  completedAt: Date | null;
  checkInCount: number;
  lastCheckInDate: string | null;
  /** Days in the challenge window — the number of check-ins that completes it. */
  requiredDays: number;
}

/** A participant, as their challenge's Creator is allowed to see them. */
export interface ParticipantProgress extends ParticipationProgress {
  participant: { id: string; displayName: string };
}

/** A challenge a user has joined, with their progress through it. */
export interface JoinedChallenge extends ParticipationProgress {
  challenge: ChallengeSummary;
}

export interface CheckInResult {
  date: string;
  note: string | null;
  proofImage: string | null;
  pointsAwarded: number;
  /** True when this check-in completed the challenge and released its reward. */
  completedChallenge: boolean;
  /** The balance after this check-in, so a client need not make a second call to refresh it. */
  balance: number;
  progress: ParticipationProgress;
}

/**
 * Joining challenges, daily check-ins, and progress.
 *
 * Split from `ChallengeService` because the two own different things: that one owns the challenge and its
 * approval, this one owns a user's relationship to it. Keeping them together would produce a single service
 * with two unrelated reasons to change.
 */
export class ParticipationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly challengeService: ChallengeService,
    private readonly pointsService: PointsService,
  ) {}

  private get participations(): Repository<ChallengeParticipation> {
    return this.dataSource.getRepository(ChallengeParticipation);
  }

  private get checkIns(): Repository<ChallengeCheckIn> {
    return this.dataSource.getRepository(ChallengeCheckIn);
  }

  /**
   * Takes a seat on an approved challenge.
   *
   * Runs in a transaction that locks the challenge row first. Counting participants and then inserting is a
   * race without the lock: two simultaneous joins on the last seat both read `capacity - 1` and both
   * succeed, putting the challenge over capacity with no constraint to catch it. Serialising per challenge
   * is the cost, and joins are rare enough that it does not matter.
   */
  async join(actor: AuthContext, challengeId: string): Promise<JoinedChallenge> {
    const participationId = await this.dataSource.transaction(async (manager) => {
      const challenge = await manager.findOne(Challenge, {
        where: { id: challengeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!challenge) {
        throw new NotFoundError('No challenge with that id');
      }

      // Reported as absent rather than forbidden: an unapproved challenge has never been visible to a
      // User, and a 403 would confirm that one exists under this id.
      if (challenge.status !== ChallengeStatus.APPROVED) {
        throw new NotFoundError('No challenge with that id');
      }

      if (challenge.endDate < today()) {
        throw new ConflictError('This challenge has already ended');
      }

      const participants = await manager.countBy(ChallengeParticipation, { challengeId });
      if (participants >= challenge.capacity) {
        throw new ConflictError(`This challenge is full (${challenge.capacity} participants)`);
      }

      try {
        const participation = await manager.save(
          manager.create(ChallengeParticipation, { challengeId, userId: actor.userId }),
        );
        return participation.id;
      } catch (error) {
        // The unique key is still the authority even with the lock held — it covers the case of the same
        // user double-tapping join, which the capacity check would happily allow.
        if (isUniqueViolation(error, 'uq_participation_challenge_user')) {
          throw new ConflictError('You have already joined this challenge');
        }
        throw error;
      }
    });

    return this.getJoinedChallenge(participationId);
  }

  /**
   * Records a check-in and pays for it.
   *
   * The check-in row and its ledger entry are written in one transaction. That is not a nicety: the unique
   * key on `(participation_id, check_in_date)` means a check-in that committed without its award could never
   * be retried, leaving the day permanently unpaid.
   *
   * The date defaults to today and may be backdated within the challenge's window, so a participant can log
   * a day they missed. It may never be in the future, and the unique key means a backfilled day still cannot
   * be paid for twice.
   */
  async checkIn(
    actor: AuthContext,
    challengeId: string,
    input: CheckInDto,
    proofImage: string | null,
  ): Promise<CheckInResult> {
    const challenge = await this.dataSource.getRepository(Challenge).findOneBy({ id: challengeId });

    if (!challenge || challenge.status === ChallengeStatus.DRAFT) {
      throw new NotFoundError('No challenge with that id');
    }

    const participation = await this.participations.findOneBy({
      challengeId,
      userId: actor.userId,
    });

    if (!participation) {
      throw new ForbiddenError('Join this challenge before checking in');
    }

    if (participation.status === ParticipationStatus.WITHDRAWN) {
      throw new ForbiddenError('You have withdrawn from this challenge');
    }

    const date = input.date ?? today();

    if (date > today()) {
      throw new ValidationError('A check-in cannot be dated in the future');
    }

    if (date < challenge.startDate || date > challenge.endDate) {
      throw new ValidationError(
        `A check-in must fall within the challenge window, ${challenge.startDate} to ${challenge.endDate}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const checkIn = await this.insertCheckIn(manager, participation.id, date, input, proofImage);

      await this.pointsService.award(manager, {
        userId: actor.userId,
        amount: PointsPolicy.CHALLENGE_CHECK_IN,
        reason: PointsReason.CHALLENGE_CHECK_IN,
        referenceType: PointsReferenceType.CHALLENGE_CHECK_IN,
        referenceId: checkIn.id,
        description: `${challenge.title} check-in`,
      });

      let pointsAwarded: number = PointsPolicy.CHALLENGE_CHECK_IN;
      let completedChallenge = false;

      const progress = await this.progressOf(manager, participation, challenge);

      // Completion is perfect attendance: one check-in for every day of the window. An unambiguous rule
      // that can be evaluated the moment the last one lands, with no scheduled job to decide it later.
      if (
        progress.checkInCount >= progress.requiredDays &&
        participation.status !== ParticipationStatus.COMPLETED
      ) {
        await manager.update(ChallengeParticipation, participation.id, {
          status: ParticipationStatus.COMPLETED,
          completedAt: new Date(),
        });

        // A challenge may legitimately offer no reward, and the ledger refuses a zero-amount row — so the
        // completion is recorded on the participation either way, and only a real reward is paid.
        if (challenge.pointsReward > 0) {
          await this.pointsService.award(manager, {
            userId: actor.userId,
            amount: challenge.pointsReward,
            reason: PointsReason.CHALLENGE_COMPLETION,
            referenceType: PointsReferenceType.CHALLENGE_PARTICIPATION,
            referenceId: participation.id,
            description: `${challenge.title} completed`,
          });
          pointsAwarded += challenge.pointsReward;
        }

        completedChallenge = true;
        progress.status = ParticipationStatus.COMPLETED;
      }

      return {
        date,
        note: checkIn.note,
        proofImage: checkIn.proofImage,
        pointsAwarded,
        completedChallenge,
        // Read inside the transaction so it includes the rows just written.
        balance: await this.pointsService.getBalance(actor.userId, manager),
        progress,
      };
    });
  }

  /**
   * The participants of a challenge, for its own Creator.
   *
   * The specification is explicit that this is scoped to challenges the Creator owns, so another Creator —
   * and an Admin, who has no need for it — is refused. This is the one place participant identity is
   * exposed, and it exposes attendance only: never a user's habits, budgets, or balance.
   */
  async listParticipants(
    actor: AuthContext,
    challengeId: string,
    query: ListQueryDto,
  ): Promise<Page<ParticipantProgress>> {
    const challenge = await this.dataSource.getRepository(Challenge).findOneBy({ id: challengeId });

    if (!challenge) {
      throw new NotFoundError('No challenge with that id');
    }

    if (challenge.createdById !== actor.userId) {
      throw new ForbiddenError('You can only view participants of your own challenges');
    }

    const request = toPageRequest(query);

    const [participations, total] = await this.participations
      .createQueryBuilder('participation')
      .innerJoin('participation.user', 'participant')
      .addSelect(['participant.id', 'participant.displayName'])
      .where('participation.challengeId = :challengeId', { challengeId })
      .orderBy('participation.createdAt', query.sortDir ?? 'ASC')
      .addOrderBy('participation.id', 'ASC')
      .skip(request.skip)
      .take(request.take)
      .getManyAndCount();

    const stats = await this.checkInStats(participations.map((participation) => participation.id));

    return toPage(
      participations.map((participation) => ({
        ...toProgress(participation, challenge, stats.get(participation.id)),
        participant: {
          id: participation.user.id,
          displayName: participation.user.displayName,
        },
      })),
      total,
      request,
    );
  }

  /** The challenges the caller has joined, with their own progress through each. */
  async listMine(actor: AuthContext, query: ListQueryDto): Promise<Page<JoinedChallenge>> {
    const request = toPageRequest(query);

    const [participations, total] = await this.participations
      .createQueryBuilder('participation')
      .where('participation.userId = :userId', { userId: actor.userId })
      .orderBy('participation.createdAt', query.sortDir ?? 'DESC')
      .addOrderBy('participation.id', 'ASC')
      .skip(request.skip)
      .take(request.take)
      .getManyAndCount();

    const challengeIds = participations.map((participation) => participation.challengeId);
    const [summaries, challenges, stats] = await Promise.all([
      this.challengeService.summarizeByIds(challengeIds),
      this.challengesByIds(challengeIds),
      this.checkInStats(participations.map((participation) => participation.id)),
    ]);

    return toPage(
      participations.flatMap((participation) => {
        const summary = summaries.get(participation.challengeId);
        const challenge = challenges.get(participation.challengeId);

        // A foreign key guarantees both are present; the guard is here so the types need no assertion.
        if (!summary || !challenge) return [];

        return [
          {
            ...toProgress(participation, challenge, stats.get(participation.id)),
            challenge: summary,
          },
        ];
      }),
      total,
      request,
    );
  }

  // ---------------------------------------------------------------- Internal

  private async insertCheckIn(
    manager: EntityManager,
    participationId: string,
    date: string,
    input: CheckInDto,
    proofImage: string | null,
  ): Promise<ChallengeCheckIn> {
    try {
      return await manager.save(
        manager.create(ChallengeCheckIn, {
          participationId,
          checkInDate: date,
          note: input.note ?? null,
          proofImage,
        }),
      );
    } catch (error) {
      // The database is the guard against a double check-in, not a preceding read — two concurrent requests
      // would both pass that read, and both would be paid.
      if (isUniqueViolation(error, 'uq_check_in_participation_date')) {
        throw new ConflictError(`You have already checked in for ${date}`);
      }
      throw error;
    }
  }

  /**
   * Shapes a participation for a response.
   *
   * Takes no actor: it is only ever called with an id this service just created or already scoped, so a
   * second ownership check here would be the same rule in two places.
   */
  private async getJoinedChallenge(participationId: string): Promise<JoinedChallenge> {
    const participation = await this.participations.findOneBy({ id: participationId });
    if (!participation) {
      throw new NotFoundError('No participation with that id');
    }

    const challenge = await this.dataSource
      .getRepository(Challenge)
      .findOneByOrFail({ id: participation.challengeId });

    const summaries = await this.challengeService.summarizeByIds([participation.challengeId]);
    const summary = summaries.get(participation.challengeId);
    if (!summary) {
      throw new NotFoundError('No challenge with that id');
    }

    const stats = await this.checkInStats([participationId]);

    return {
      ...toProgress(participation, challenge, stats.get(participationId)),
      challenge: summary,
    };
  }

  private async progressOf(
    manager: EntityManager,
    participation: ChallengeParticipation,
    challenge: Challenge,
  ): Promise<ParticipationProgress> {
    const stats = await manager
      .createQueryBuilder(ChallengeCheckIn, 'checkIn')
      .select('COUNT(*)', 'count')
      .addSelect('MAX(checkIn.checkInDate)', 'lastDate')
      .where('checkIn.participationId = :participationId', {
        participationId: participation.id,
      })
      .getRawOne<CheckInStatsRow>();

    return toProgress(participation, challenge, stats ?? undefined);
  }

  /** Check-in counts and the most recent date, for a page of participations. */
  private async checkInStats(participationIds: string[]): Promise<Map<string, CheckInStatsRow>> {
    if (participationIds.length === 0) return new Map();

    const rows = await this.checkIns
      .createQueryBuilder('checkIn')
      .select('checkIn.participationId', 'participationId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MAX(checkIn.checkInDate)', 'lastDate')
      .where('checkIn.participationId IN (:...participationIds)', { participationIds })
      .groupBy('checkIn.participationId')
      .getRawMany<CheckInStatsRow & { participationId: string }>();

    return new Map(rows.map((row) => [row.participationId, row]));
  }

  private async challengesByIds(challengeIds: string[]): Promise<Map<string, Challenge>> {
    if (challengeIds.length === 0) return new Map();

    const challenges = await this.dataSource
      .getRepository(Challenge)
      .createQueryBuilder('challenge')
      .where('challenge.id IN (:...challengeIds)', { challengeIds })
      .getMany();

    return new Map(challenges.map((challenge) => [challenge.id, challenge]));
  }
}

interface CheckInStatsRow {
  /** `COUNT(*)` is a bigint, which the driver returns as a string. */
  count: string;
  /** `MAX(date)` comes back as `YYYY-MM-DD`, or null when there are no check-ins yet. */
  lastDate: string | null;
}

function toProgress(
  participation: ChallengeParticipation,
  challenge: Challenge,
  stats: CheckInStatsRow | undefined,
): ParticipationProgress {
  return {
    id: participation.id,
    status: participation.status,
    // `createdAt` on the participation is the moment the user joined.
    joinedAt: participation.createdAt,
    completedAt: participation.completedAt,
    checkInCount: Number(stats?.count ?? 0),
    lastCheckInDate: stats?.lastDate ?? null,
    requiredDays: requiredDays(challenge),
  };
}

/** Days in the window, inclusive of both ends — the number of check-ins that completes a challenge. */
function requiredDays(challenge: Challenge): number {
  return daysBetween(challenge.startDate, challenge.endDate) + 1;
}

export const participationService = new ParticipationService(
  AppDataSource,
  challengeService,
  pointsService,
);
