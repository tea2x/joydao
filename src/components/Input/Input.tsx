import React, { HTMLInputTypeAttribute } from "react";
import styles from "./Input.module.scss";
import { cx } from "../../utils/classname";

const Input: React.FC<InputProps> = ({
  leadIcon,
  trailText,
  htmlType,
  className,
  value,
  ...rest
}) => {
  return (
    <div
      className={cx([
        styles.inputWrapper,
        className,
        trailText && "has-trail_text",
        leadIcon && "has-lead-icon",
      ])}
    >
      {leadIcon && (
        <img
          src={leadIcon}
          alt="joyDAO"
          draggable={false}
          className="lead_icon"
        />
      )}
      <input className={styles.baseInput} type={htmlType} {...rest} />
      {trailText && <span className="trail_text">{trailText}</span>}
    </div>
  );
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leadIcon?: string;
  trailText?: string;
  htmlType?: HTMLInputTypeAttribute;
};

export default Input;
