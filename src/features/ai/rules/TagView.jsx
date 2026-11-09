import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import PageHeader from '../../../components/PageHeader.jsx';
import StoryList, { EmptyState } from '../../../components/StoryList.jsx';
import { useNow } from '../../../lib/useNow.js';
import { useListed } from './listed.js';
import { selectTagged } from './ruleEffects.js';
import { selectAllRules } from './rulesSlice.js';

/** Stories a rule tagged, at /tags/:tag (US-105). */
export default function TagView() {
  const { tag = '' } = useParams();
  const tagged = useSelector(selectTagged).get(tag) ?? [];
  const known = useSelector(selectAllRules).some(
    (rule) => rule.action === 'tag' && rule.tag === tag,
  );
  const listed = useListed();
  const now = useNow();
  const stories = tagged.map(listed);
  const count = `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`;

  return (
    <>
      <PageHeader title={tag} description={`Tagged by your rules · ${count}`} />
      {stories.length === 0 ? (
        <EmptyState
          title={known ? `Nothing tagged ${tag} yet` : `No tag called ${tag}`}
          icon="tag"
          action={{ to: '/settings/rules', label: 'Manage rules' }}
        >
          {known
            ? 'Stories your rule tags will show up here.'
            : 'Tags come from your filter rules.'}
        </EmptyState>
      ) : (
        <StoryList stories={stories} now={now} loading={false} label={tag} />
      )}
    </>
  );
}
