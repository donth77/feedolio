import { useEffect, useId, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Icon from '../../components/Icon.jsx';
import { readingChanged, selectReading } from '../preferences/preferencesSlice.js';
import styles from './ReadingSettings.module.css';

const SIZES = [
  ['s', 'S', 'Small'],
  ['m', 'M', 'Medium'],
  ['l', 'L', 'Large'],
  ['xl', 'XL', 'Extra large'],
];
const FONTS = [
  ['serif', 'Serif', 'Serif'],
  ['sans', 'Sans', 'Sans serif'],
];
const WIDTHS = [
  ['narrow', 'Narrow', 'Narrow'],
  ['wide', 'Wide', 'Wide'],
];

/**
 * The "Aa" button and its panel: text size, serif or sans, and line width.
 * Choices apply at once to every story and are remembered on this device.
 */
export default function ReadingSettings() {
  const reading = useSelector(selectReading);
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const wrapper = useRef(/** @type {HTMLDivElement|null} */ (null));
  const trigger = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const panelId = useId();

  const close = (/** @type {boolean} */ returnFocus) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    wrapper.current?.querySelector('input:checked')?.focus();
    const closeOnOutsideClick = (/** @type {PointerEvent} */ event) => {
      if (!wrapper.current?.contains(/** @type {Node} */ (event.target))) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  return (
    <div className={styles.wrapper} ref={wrapper}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label="Reading settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span aria-hidden="true" className={styles.glyph}>
          Aa
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          className={styles.panel}
          role="dialog"
          aria-label="Reading settings"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close(true);
            }
          }}
        >
          <div className={styles.head}>
            <p className={styles.heading}>Reading settings</p>
            <button
              type="button"
              className={styles.close}
              aria-label="Close reading settings"
              onClick={() => close(true)}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <Choice
            legend="Text size"
            options={SIZES}
            value={reading.size}
            onChange={(size) => dispatch(readingChanged({ size }))}
          />
          <Choice
            legend="Font"
            options={FONTS}
            value={reading.font}
            onChange={(font) => dispatch(readingChanged({ font }))}
          />
          <Choice
            legend="Line width"
            options={WIDTHS}
            value={reading.width}
            onChange={(width) => dispatch(readingChanged({ width }))}
          />
          <p className={styles.note}>Saved on this device and used for every story.</p>
        </div>
      )}
    </div>
  );
}

/**
 * A row of mutually exclusive options, as radio buttons.
 *
 * @param {{
 *   legend: string,
 *   options: string[][],
 *   value: string,
 *   onChange: (value: any) => void,
 * }} props
 */
function Choice({ legend, options, value, onChange }) {
  const name = useId();
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.segments}>
        {options.map(([id, shown, spoken]) => (
          <label key={id} className={styles.segment}>
            <input
              type="radio"
              name={name}
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
            />
            <span aria-hidden="true">{shown}</span>
            <span className="visually-hidden">{spoken}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
