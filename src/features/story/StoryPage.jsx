import PageHeader from '../../components/PageHeader.jsx';

/**
 * One story on its own page, at /feeds/:feedId/stories/:storyId.
 * Loaded on demand. Filled in by M3.
 */
export default function StoryPage() {
  return (
    <PageHeader
      title="Story"
      description="The story will appear here, with everything its feed provides."
    />
  );
}
