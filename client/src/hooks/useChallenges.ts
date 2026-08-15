import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { challengesApi } from '../services/challenges';
import type {
  AuthoredChallengeQuery,
  ChallengeInput,
  ChallengeQuery,
  CheckInInput,
} from '../services/challenges';
import type { QueryParams } from '../services/api';
import { queryKeys } from '../services/queryKeys';
import { useInvalidate } from './useInvalidate';

// --------------------------------------------------------------------- Reads

/** Approved challenges. The only challenge list a User can see. */
export function useChallenges(query: ChallengeQuery) {
  return useQuery({
    queryKey: queryKeys.challenges.browse(query),
    queryFn: () => challengesApi.browse(query),
    placeholderData: keepPreviousData,
  });
}

export function useChallenge(id: string) {
  return useQuery({
    queryKey: queryKeys.challenges.detail(id),
    queryFn: () => challengesApi.getOne(id),
  });
}

/** A Creator's own challenges, at every status. */
export function useAuthoredChallenges(query: AuthoredChallengeQuery) {
  return useQuery({
    queryKey: queryKeys.challenges.authored(query),
    queryFn: () => challengesApi.listAuthored(query),
    placeholderData: keepPreviousData,
  });
}

/** The Admin approval queue. */
export function usePendingChallenges(query: ChallengeQuery) {
  return useQuery({
    queryKey: queryKeys.challenges.pending(query),
    queryFn: () => challengesApi.listPendingApproval(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * Participant progress for one challenge.
 *
 * Creator-only, and the server scopes it to challenges this Creator owns — asking for another Creator's
 * challenge answers 404, not 403, because a 403 would confirm the challenge exists.
 */
export function useParticipants(id: string, query: QueryParams) {
  return useQuery({
    queryKey: queryKeys.challenges.participants(id, query),
    queryFn: () => challengesApi.listParticipants(id, query),
    placeholderData: keepPreviousData,
  });
}

export function useJoinedChallenges(query: QueryParams) {
  return useQuery({
    queryKey: queryKeys.participations.joined(query),
    queryFn: () => challengesApi.listJoined(query),
    placeholderData: keepPreviousData,
  });
}

// -------------------------------------------------------------------- Writes

export function useCreateChallenge() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ input, coverImage }: { input: ChallengeInput; coverImage?: File }) =>
      challengesApi.create(input, coverImage),
    onSuccess: () => invalidate(queryKeys.challenges.all),
  });
}

export function useUpdateChallenge() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({
      id,
      input,
      coverImage,
    }: {
      id: string;
      input: Partial<ChallengeInput>;
      coverImage?: File;
    }) => challengesApi.update(id, input, coverImage),
    onSuccess: () => invalidate(queryKeys.challenges.all),
  });
}

export function useDeleteChallenge() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => challengesApi.remove(id),
    onSuccess: () => invalidate(queryKeys.challenges.all),
  });
}

export function useSubmitChallenge() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => challengesApi.submit(id),
    onSuccess: () => invalidate(queryKeys.challenges.all),
  });
}

export function useApproveChallenge() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => challengesApi.approve(id),
    onSuccess: () => invalidate(queryKeys.challenges.all),
  });
}

export function useRejectChallenge() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      challengesApi.reject(id, reason),
    onSuccess: () => invalidate(queryKeys.challenges.all),
  });
}

/** Joining fills a seat, so the browse list's participant counts and availability filter both move. */
export function useJoinChallenge() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id: string) => challengesApi.join(id),
    onSuccess: () => invalidate(queryKeys.challenges.all, queryKeys.participations.all),
  });
}

/** Awards points, and may complete the challenge and release its reward — so the economy moves too. */
export function useCheckIn() {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({
      id,
      input,
      proofImage,
    }: {
      id: string;
      input: CheckInInput;
      proofImage?: File;
    }) => challengesApi.checkIn(id, input, proofImage),
    onSuccess: () =>
      invalidate(queryKeys.challenges.all, queryKeys.participations.all, queryKeys.points.all),
  });
}
