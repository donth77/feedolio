import { useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router';
import { toastShown } from '../../../app/toastSlice.js';
import Icon from '../../../components/Icon.jsx';
import PageHeader from '../../../components/PageHeader.jsx';
import { EmptyState } from '../../../components/StoryList.jsx';
import StoryRow from '../../../components/StoryRow.jsx';
import listStyles from '../../../components/StoryList.module.css';
import { useFocusAfterRemoval } from '../../../lib/useFocusAfterRemoval.js';
import { useNow } from '../../../lib/useNow.js';
import { useAiContext } from '../useAi.js';
import { judgmentAnswered } from './judgmentsSlice.js';
import { useListed } from './listed.js';
import { selectHiddenIds, selectMaybeJudgments } from './ruleEffects.js';
import styles from './RuleViews.module.css';

/** @typedef {import('./judgmentsSlice.js').Judgment} Judgment */

/**
 * Stories a rule wasn't sure about, at /maybe (US-107). Nothing happens to
 * them until the reader answers, and the answer is remembered: it wins over
 * the model.
 */
export default function MaybeView() {
  const dispatch = useDispatch();
  const maybes = useSelector(selectMaybeJudgments);
  const hiddenCount = useSelector(selectHiddenIds).size;
  const { decisionReady } = useAiContext();
  const listed = useListed();
  const now = useNow();
  const list = useRef(/** @type {HTMLUListElement|null} */ (null));
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const answering = useFocusAfterRemoval(list, 'button[data-answer]', heading, maybes);

  /**
   * @param {Judgment} judgment
   * @param {number} index
   * @param {'yes'|'no'} answer
   */
  function answer(judgment, index, answer) {
    answering(index);
    const which = { storyId: judgment.storyId, ruleId: judgment.ruleId };
    dispatch(judgmentAnswered({ ...which, readerSaid: answer }));
    dispatch(
      toastShown({
        message:
          answer === 'yes' ? done(judgment) : `${notDone(judgment)}. Feedolio will remember.`,
        undo: judgmentAnswered({ ...which, readerSaid: null }),
      }),
    );
  }

  return (
    <>
      <PageHeader
        title="Maybe"
        description="Your rules weren’t sure about these. Tell Feedolio and it will remember."
        actions={
          <Link to="/hidden" className={styles.headerLink}>
            <Icon name="hidden" size={18} />
            Hidden ({hiddenCount})
          </Link>
        }
      />
      <p className={styles.note} role="note">
        <Icon name="info" size={18} />
        <span>
          {decisionReady ? 'Checked by Jev (decision model).' : 'Checked by your general model.'}{' '}
          Stories land here when a rule can’t decide. Nothing changes until you answer, and nothing
          is ever deleted.
        </span>
      </p>
      <h2 ref={heading} tabIndex={-1} className="visually-hidden">
        Stories to review
      </h2>
      {maybes.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          icon="maybe"
          action={{ to: '/', label: 'Back to All stories' }}
        >
          When a rule isn’t sure about a new story, it will wait here for you.
        </EmptyState>
      ) : (
        <ul ref={list} className={listStyles.list} aria-label="Stories to review">
          {maybes.map((judgment, index) => {
            const item = listed(judgment);
            const percent = Math.round(judgment.confidence * 100);
            return (
              <StoryRow
                key={`${judgment.storyId}|${judgment.ruleId}`}
                item={item}
                now={now}
                headingLevel={2}
                from={{ pathname: '/maybe', label: 'Maybe' }}
                note={
                  <span className={styles.why}>
                    <span className={styles.meter} aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                    <span>
                      Maybe {percent}% match · Rule: “{judgment.rule.text}”
                    </span>
                  </span>
                }
                action={false}
                extra={
                  <div className={styles.answers}>
                    <button
                      type="button"
                      className={styles.primary}
                      data-answer=""
                      onClick={() => answer(judgment, index, 'yes')}
                    >
                      {yesLabel(judgment)}
                      <span className="visually-hidden">: {item.story.title}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => answer(judgment, index, 'no')}
                    >
                      Not a match<span className="visually-hidden">: {item.story.title}</span>
                    </button>
                  </div>
                }
              />
            );
          })}
        </ul>
      )}
    </>
  );
}

/** @param {Judgment} judgment */
function yesLabel({ rule }) {
  if (rule.action === 'hide') return 'Yes, hide it';
  if (rule.action === 'highlight') return 'Yes, highlight it';
  return `Yes, tag as ${rule.tag}`;
}

/** @param {Judgment} judgment */
function done({ rule }) {
  if (rule.action === 'hide') return 'Hidden. It’s in Hidden if you want it back.';
  if (rule.action === 'highlight') return 'Highlighted';
  return `Tagged as ${rule.tag}`;
}

/** @param {Judgment} judgment */
function notDone({ rule }) {
  if (rule.action === 'hide') return 'Not hidden';
  if (rule.action === 'highlight') return 'Not highlighted';
  return `Not tagged as ${rule.tag}`;
}
