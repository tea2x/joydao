import { common } from "@ckb-lumos/common-scripts";
import { Address, Transaction } from "@ckb-lumos/base";
import { CKBTransaction } from '@joyid/ckb';
import { TransactionSkeleton, createTransactionFromSkeleton } from "@ckb-lumos/helpers";
import { INDEXER_URL, FEE_RATE } from "./config";
import { Indexer } from "@ckb-lumos/ckb-indexer";
const indexer = new Indexer(INDEXER_URL);

// inherit from ccc demo
type FixedPoint = bigint;
type FixedPointLike = bigint | string | number;
function fixedPointFrom(val: FixedPointLike, decimals = 8): FixedPoint {
  if (typeof val === "bigint") {
    return val;
  }

  const [l, r] = val.toString().split(".");
  const lVal = BigInt(l.padEnd(l.length + decimals, "0"));
  if (r === undefined) {
    return lVal;
  }

  return lVal + BigInt(r.slice(0, decimals).padEnd(decimals, "0"));
}

export const buildTransfer = async (
  from: Address,
  to: Address,
  amount: string
): Promise<CKBTransaction> => {
  
  let txSkeleton = TransactionSkeleton({ cellProvider: indexer });

  txSkeleton = await common.transfer(
    txSkeleton,
    [from],
    to,
    fixedPointFrom(amount),
    undefined,
    undefined
  );

  txSkeleton = await common.payFeeByFeeRate(
    txSkeleton,
    [from],
    BigInt(FEE_RATE),
    undefined
  );

  const transferTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return transferTx as CKBTransaction;
}
