import { useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toastShown } from '../../../app/toastSlice.js';
import Icon from '../../../components/Icon.jsx';
import PageHeader from '../../../components/PageHeader.jsx';
import { EmptyState } from '../../../components/StoryList.jsx';
import StoryRow from '../../../components/StoryRow.jsx';
import listStyles from '../../../components/StoryList.module.css';
import { useFocusAfterRemoval } from '../../../lib/useFocusAfterRemoval.js';
import { useNow } from '../../../lib/useNow.js';
import { judgmentAnswered } from './judgmentsSlice.js';
import { useListed } from './listed.js';
import { selectHiddenJudgments } from './ruleEffects.js';
import styles from './RuleViews.module.css';
import { ruleLabel } from './verdicts.js';

/**
 * Stories the reader's rules hid, at /hidden (US-108). They stay here until
 * the reader unhides them; nothing is ever deleted.
 */
export default function HiddenView() {
  const dispatch = useDispatch();
  const hidden = useSelector(selectHiddenJudgments);
  const listed = useListed();
  const now = useNow();
  const list = useRef(/** @type {HTMLUListElement|null} */ (null));
  const heading = useRef(/** @type {HTMLHeadingElement|null} */ (null));
  const unhiding = useFocusAfterRemoval(list, 'button[data-unhide]', heading, hidden);

  return (
    <>
      <PageHeader
        title="Hidden"
        description="Stories your rules hid. They stay here until you unhide them, and nothing is ever deleted."
      />
      <h2 ref={heading} tabIndex={-1} className="visually-hidden">
        Hidden stories
      </h2>
      {hidden.length === 0 ? (
        <EmptyState
          title="Nothing is hidden right now"
          icon="hidden"
          action={{ to: '/', label: 'Back to All stories' }}
        >
          Stories your rules hide will wait here.
        </EmptyState>
      ) : (
        <ul ref={list} className={listStyles.list} aria-label="Hidden stories">
          {hidden.map((judgment, index) => {
            const item = listed(judgment);
            const why =
              judgment.readerSaid === 'yes'
                ? `You hid it from Maybe · rule: ${ruleLabel(judgment.rule.text)}`
                : `Hidden by rule: ${ruleLabel(judgment.rule.text)} · ${Math.round(judgment.confidence * 100)}% match`;
            return (
              <StoryRow
                key={judgment.storyId}
                item={item}
                now={now}
                headingLevel={2}
                from={{ pathname: '/hidden', label: 'Hidden' }}
                note={
                  <>
                    <Icon name="hidden" size={16} />
                    {why}
                  </>
                }
                action={
                  <button
                    type="button"
                    className={styles.secondary}
                    data-unhide=""
                    onClick={() => {
                      unhiding(index);
                      const which = { storyId: judgment.storyId, ruleId: judgment.ruleId };
                      dispatch(judgmentAnswered({ ...which, readerSaid: 'no' }));
                      dispatch(
                        toastShown({
                          message: 'Moved back to your stories',
                          undo: judgmentAnswered({ ...which, readerSaid: judgment.readerSaid }),
                        }),
                      );
                    }}
                  >
                    Unhide<span className="visually-hidden">: {item.story.title}</span>
                  </button>
                }
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
