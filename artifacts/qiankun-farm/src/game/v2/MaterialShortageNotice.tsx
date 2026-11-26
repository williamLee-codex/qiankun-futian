import { materialShortageLines, materialShortageTitle, type MaterialShortage } from "./materialShortageNotice";

/**
 * A short material is normal usage, not a fault: the panel stays where it is,
 * keeps the chosen product and quantity, and only closes this notice.
 */
export function MaterialShortageNotice(props: {
  shortages: MaterialShortage[];
  onClose: () => void;
}) {
  return (
    <section role="status" aria-live="polite" className="farm-v2-material-shortage">
      <strong>{materialShortageTitle}</strong>
      <ul>
        {materialShortageLines(props.shortages).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" onClick={props.onClose}>
        關閉
      </button>
    </section>
  );
}
