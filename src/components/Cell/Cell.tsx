import React, { CSSProperties } from "react";
import styles from "./Cell.module.scss";
import { cx } from "../../utils/classname";

const VALUE_THRESHOLD_1 = 150;
const VALUE_THRESHOLD_2 = 200;

const Cell: React.FC<CellProps> = ({ className, type, value, ...rest }) => {
  let size: "large" | "medium" | "small";
  console.log(value);
  switch (true) {
    case value < VALUE_THRESHOLD_1: {
      size = "small";
      break;
    }
    case value < VALUE_THRESHOLD_2: {
      size = "medium";
      break;
    }
    default: {
      size = "large";
    }
  }

  const isDeposit = type === "deposit";
  return (
    <div
      className={cx([
        styles.daoCell,
        className,
        `${type}-type`,
        `${size}-size`,
      ])}
      onClick={(e) => e.stopPropagation()}
      style={{ "--progress": "120deg" } as CSSProperties}
    >
      <div className="amount">
        <img
          src={
            isDeposit
              ? require("../../assets/icons/deposit-mine.svg").default
              : require("../../assets/icons/withdraw-mine.svg").default
          }
          className="amount-icon"
          draggable="false"
          alt="mine"
        />
        <span>{value} CKB</span>
      </div>
      <button className="dao-cell-btn">
        <span className="btn-text">
          {isDeposit ? "Withdraw" : "Processing"}
        </span>
        <img
          src={
            isDeposit
              ? require("../../assets/icons/getout-deposit.svg").default
              : require("../../assets/icons/withdraw-processing.svg").default
          }
          className="btn-icon"
          draggable="false"
          alt="mine"
        />
      </button>
    </div>
  );
};

type CellProps = React.HTMLAttributes<HTMLDivElement> & {
  type: "deposit" | "withdraw";
  progress: number;
  value: number;
};

export default Cell;
