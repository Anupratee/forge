import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader, PageHeader } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { SelectField, TextAreaField, TextField } from '../components/Field';
import { Loading } from '../components/Loading';
import { useChallenge, useCreateChallenge, useUpdateChallenge } from '../hooks/useChallenges';
import { ApiError, uploadUrl } from '../services/api';
import type { ChallengeSummary } from '../types/api';
import { ChallengeCategory, ChallengeStatus, valuesOf } from '../types/enums';
import { todayIso } from '../utils/format';

/**
 * Create and edit, on one screen.
 *
 * They are the same form because the server accepts the same fields either way; the only difference is
 * that an edit starts populated. The route decides which by whether it carries an id.
 */
export function ChallengeEditorPage() {
  const { id } = useParams();
  const existing = useChallenge(id ?? '');

  if (id === undefined) return <ChallengeForm />;

  if (existing.isPending) return <Loading label="Loading the challenge" />;
  if (existing.isError) {
    return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  }

  return <ChallengeForm challenge={existing.data} />;
}

function ChallengeForm({ challenge }: { challenge?: ChallengeSummary }) {
  const isEdit = challenge !== undefined;
  const navigate = useNavigate();

  const [title, setTitle] = useState(challenge?.title ?? '');
  const [description, setDescription] = useState(challenge?.description ?? '');
  const [category, setCategory] = useState<ChallengeCategory>(
    challenge?.category ?? ChallengeCategory.FITNESS,
  );
  const [startDate, setStartDate] = useState(challenge?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(challenge?.endDate ?? '');
  const [capacity, setCapacity] = useState(String(challenge?.capacity ?? 25));
  const [pointsReward, setPointsReward] = useState(String(challenge?.pointsReward ?? 100));
  const [coverImage, setCoverImage] = useState<File | undefined>(undefined);

  const create = useCreateChallenge();
  const update = useUpdateChallenge();

  const active = isEdit ? update : create;
  const error = active.error instanceof ApiError ? active.error : null;

  const submit = () => {
    const input = {
      title,
      description,
      category,
      startDate,
      endDate,
      capacity: Number(capacity),
      pointsReward: Number(pointsReward),
    };

    if (isEdit) {
      update.mutate(
        { id: challenge.id, input, coverImage },
        { onSuccess: () => navigate('/authored') },
      );
    } else {
      create.mutate({ input, coverImage }, { onSuccess: () => navigate('/authored') });
    }
  };

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit challenge' : 'New challenge'}
        description={
          isEdit
            ? 'Saving keeps it a draft — submit it separately when it is ready for review.'
            : 'This is saved as a draft. Nobody can see it until an Admin approves it.'
        }
      />

      <Link to="/authored" className="text-forge-600 text-sm hover:underline">
        ← My challenges
      </Link>

      {/*
        A material change to an approved challenge sends it back for review. The rule and the field
        list live in `ChallengeStateMachine.ts` on the server; this is the warning, not the rule.
      */}
      {isEdit && challenge.status === ChallengeStatus.APPROVED && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          This challenge is live. Changing the title, description, category, dates, capacity, or
          reward returns it to <span className="font-medium">Pending approval</span> until an Admin
          reviews it again.
        </p>
      )}

      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <TextField
              label="Title"
              value={title}
              required
              error={error?.messageFor('title')}
              onChange={(event) => setTitle(event.target.value)}
            />

            <TextAreaField
              label="Description"
              value={description}
              rows={6}
              required
              hint="At least 20 characters — this is what participants read before joining."
              error={error?.messageFor('description')}
              onChange={(event) => setDescription(event.target.value)}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                label="Category"
                value={category}
                options={valuesOf(ChallengeCategory)}
                error={error?.messageFor('category')}
                onChange={(event) => setCategory(event.target.value as ChallengeCategory)}
              />

              <TextField
                label="Starts"
                type="date"
                value={startDate}
                required
                error={error?.messageFor('startDate')}
                onChange={(event) => setStartDate(event.target.value)}
              />

              <TextField
                label="Ends"
                type="date"
                value={endDate}
                min={startDate}
                required
                hint="Must be after the start date."
                error={error?.messageFor('endDate')}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Capacity"
                type="number"
                min={1}
                value={capacity}
                required
                hint="Enforced with a row lock when someone joins."
                error={error?.messageFor('capacity')}
                onChange={(event) => setCapacity(event.target.value)}
              />

              <TextField
                label="Completion reward"
                type="number"
                min={0}
                value={pointsReward}
                required
                hint="Points paid once every day has been checked in. Requires Admin approval."
                error={error?.messageFor('pointsReward')}
                onChange={(event) => setPointsReward(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="cover"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Cover image
              </label>
              <input
                id="cover"
                type="file"
                accept="image/*"
                onChange={(event) => setCoverImage(event.target.files?.[0])}
                className="file:bg-forge-50 file:text-forge-700 hover:file:bg-forge-100 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
              />
              {isEdit && challenge.coverImage !== null && coverImage === undefined && (
                <img
                  src={uploadUrl(challenge.coverImage)}
                  alt="Current cover"
                  className="mt-2 h-24 rounded-lg object-cover"
                />
              )}
            </div>

            {active.isError && (error === null || error.fieldErrors.length === 0) && (
              <ErrorState error={active.error} />
            )}

            <div className="flex gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
              <Button type="submit" busy={active.isPending}>
                {isEdit ? 'Save changes' : 'Create draft'}
              </Button>
              <Link to="/authored">
                <Button variant="secondary">Cancel</Button>
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
