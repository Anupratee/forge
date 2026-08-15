import { Link } from 'react-router-dom';
import { Empty } from '../components/Empty';

export function NotFoundPage() {
  return (
    <Empty
      title="That page does not exist"
      description="The link may be out of date, or the screen may not be available to your role."
      filtered
      action={
        <Link to="/" className="text-forge-600 text-sm font-medium hover:underline">
          Back to the dashboard
        </Link>
      }
    />
  );
}
