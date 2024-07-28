import React from "react";
import styles from "./Button.module.scss";
import { cx } from "../../utils/classname";

const Button: React.FC<ButtonProps> = ({
  children,
  icon,
  className,
  ...rest
}) => {
  return (
    <button className={cx([styles.baseBtn, className])} {...rest}>
      {children}
      {icon && <img src={icon} alt="btn-action" />}
    </button>
  );
};

type ButtonProps = React.HTMLAttributes<HTMLButtonElement> & {
  icon?: string;
};
export default Button;
