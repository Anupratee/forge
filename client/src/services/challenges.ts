import type {
  ChallengeSummary,
  CheckInResult,
  JoinedChallenge,
  Page,
  ParticipantProgress,
} from '../types/api';
import type { ChallengeCategory, ChallengeStatus } from '../types/enums';
import type { QueryParams } from './api';
import { api, toFormData, toParams } from './api';

/** The filters the challenge endpoints accept, matching `ChallengeQueryDto` on the server. */
export interface ChallengeQuery extends QueryParams {
  keyword?: string;
  category?: ChallengeCategory;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'startDate' | 'endDate' | 'pointsReward' | 'capacity' | 'title' | 'createdAt';
  sortDir?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
  /** Hides challenges that are full or have ended. */
  availableOnly?: boolean;
}

export interface AuthoredChallengeQuery extends ChallengeQuery {
  status?: ChallengeStatus;
}

export interface ChallengeInput {
  title: string;
  description: string;
  category: ChallengeCategory;
  startDate: string;
  endDate: string;
  capacity: number;
  pointsReward: number;
}

export interface CheckInInput {
  date?: string;
  note?: string;
}

/**
 * Sends JSON when there is no image and multipart when there is.
 *
 * Multer only parses multipart, and the server's DTOs coerce numbers from strings — so both shapes are
 * accepted. Choosing per call keeps the ordinary case a plain JSON body instead of a form where every
 * value has been flattened to text.
 */
function challengeBody(input: Partial<ChallengeInput>, coverImage?: File) {
  return coverImage === undefined
    ? input
    : toFormData(input, { name: 'coverImage', value: coverImage });
}

export const challengesApi = {
  // ------------------------------------------------------------------ Browse

  /** Approved challenges, visible to every signed-in role. */
  async browse(query: ChallengeQuery): Promise<Page<ChallengeSummary>> {
    const { data } = await api.get<Page<ChallengeSummary>>('/challenges', {
      params: toParams(query),
    });
    return data;
  },

  async getOne(id: string): Promise<ChallengeSummary> {
    const { data } = await api.get<ChallengeSummary>(`/challenges/${id}`);
    return data;
  },

  // ----------------------------------------------------------------- Creator

  /** The Creator's own challenges, at every status. */
  async listAuthored(query: AuthoredChallengeQuery): Promise<Page<ChallengeSummary>> {
    const { data } = await api.get<Page<ChallengeSummary>>('/challenges/authored', {
      params: toParams(query),
    });
    return data;
  },

  async create(input: ChallengeInput, coverImage?: File): Promise<ChallengeSummary> {
    const { data } = await api.post<ChallengeSummary>(
      '/challenges',
      challengeBody(input, coverImage),
    );
    return data;
  },

  async update(
    id: string,
    input: Partial<ChallengeInput>,
    coverImage?: File,
  ): Promise<ChallengeSummary> {
    const { data } = await api.patch<ChallengeSummary>(
      `/challenges/${id}`,
      challengeBody(input, coverImage),
    );
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/challenges/${id}`);
  },

  async submit(id: string): Promise<ChallengeSummary> {
    const { data } = await api.post<ChallengeSummary>(`/challenges/${id}/submit`);
    return data;
  },

  /** Scoped on the server to challenges this Creator owns. */
  async listParticipants(id: string, query: QueryParams): Promise<Page<ParticipantProgress>> {
    const { data } = await api.get<Page<ParticipantProgress>>(`/challenges/${id}/participants`, {
      params: toParams(query),
    });
    return data;
  },

  // ------------------------------------------------------------------- Admin

  async listPendingApproval(query: ChallengeQuery): Promise<Page<ChallengeSummary>> {
    const { data } = await api.get<Page<ChallengeSummary>>('/challenges/pending-approval', {
      params: toParams(query),
    });
    return data;
  },

  async approve(id: string): Promise<ChallengeSummary> {
    const { data } = await api.post<ChallengeSummary>(`/challenges/${id}/approve`);
    return data;
  },

  async reject(id: string, reason: string): Promise<ChallengeSummary> {
    const { data } = await api.post<ChallengeSummary>(`/challenges/${id}/reject`, { reason });
    return data;
  },

  // -------------------------------------------------------------------- User

  async listJoined(query: QueryParams): Promise<Page<JoinedChallenge>> {
    const { data } = await api.get<Page<JoinedChallenge>>('/challenges/joined', {
      params: toParams(query),
    });
    return data;
  },

  async join(id: string): Promise<JoinedChallenge> {
    const { data } = await api.post<JoinedChallenge>(`/challenges/${id}/join`);
    return data;
  },

  async checkIn(id: string, input: CheckInInput, proofImage?: File): Promise<CheckInResult> {
    const body =
      proofImage === undefined
        ? input
        : toFormData(input, { name: 'proofImage', value: proofImage });

    const { data } = await api.post<CheckInResult>(`/challenges/${id}/check-ins`, body);
    return data;
  },
};
