import { useId } from 'react';
import styles from './Segmented.module.css';

/**
 * @typedef {Object} SegmentOption
 * @property {string} value
 * @property {string} label   Shown
 * @property {string} [spoken]  Read out instead, when the label is short ("XL")
 */

/**
 * A row of mutually exclusive options that looks like a segmented control
 * but is a group of radio buttons, so arrow keys and screen readers work as
 * usual.
 *
 * @param {{
 *   legend: string,
 *   options: SegmentOption[],
 *   value: string,
 *   onChange: (value: any) => void,
 *   fill?: boolean,
 *   className?: string,
 * }} props
 *   fill: options share the full width (as in the reading panel)
 */
export default function Segmented({
  legend,
  options,
  value,
  onChange,
  fill = false,
  className = '',
}) {
  const name = useId();
  return (
    <fieldset className={`${styles.fieldset} ${fill ? styles.filled : ''} ${className}`}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={`${styles.segments} ${fill ? styles.fill : ''}`}>
        {options.map((option) => (
          <label key={option.value} className={styles.segment}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.spoken ? (
              <>
                <span className={styles.face} aria-hidden="true">
                  {option.label}
                </span>
                <span className="visually-hidden">{option.spoken}</span>
              </>
            ) : (
              <span className={styles.face}>{option.label}</span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
