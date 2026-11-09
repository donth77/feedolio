import { Link } from 'react-router';
import PageHeader from '../components/PageHeader.jsx';

/** Any address the app doesn't know. */
export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" description="There’s nothing at this address." />
      <p>
        <Link to="/">Go to All stories</Link>
      </p>
    </>
  );
}
