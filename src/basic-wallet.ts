import { common } from "@ckb-lumos/common-scripts";
import { Address, Transaction } from "@ckb-lumos/base";
import { CKBTransaction } from '@joyid/ckb';
import { TransactionSkeleton, createTransactionFromSkeleton } from "@ckb-lumos/helpers";
import { INDEXER_URL, FEE_RATE } from "./config";
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { generateDefaultScriptInfos } from "@ckb-ccc/lumos-patches";
import { registerCustomLockScriptInfos } from "@ckb-lumos/common-scripts/lib/common";
import { predefined } from "@ckb-lumos/config-manager";
import { Signer } from "@ckb-ccc/core";
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

// for non-joyid wallet
export const buildTransfer = async (
  signer:Signer,
  to: Address,
  amount: string
): Promise<CKBTransaction> => {

  if (!signer)
    throw new Error("Wallet disconnected. Reconnect!");

  const prefix = await signer.client.getAddressPrefix();
  const fromAddresses = await signer.getAddresses();

  registerCustomLockScriptInfos(generateDefaultScriptInfos());
  let txSkeleton = new TransactionSkeleton({
    cellProvider: indexer,
  });
  txSkeleton = await common.transfer(
    txSkeleton,
    fromAddresses,
    to,
    fixedPointFrom(amount),
    undefined,
    undefined,
    {
      config:
      prefix === "ckb"
        ? predefined.LINA
        : predefined.AGGRON4,
    },
  );
  txSkeleton = await common.payFeeByFeeRate(
    txSkeleton,
    fromAddresses,
    BigInt(FEE_RATE),
    undefined,
    {
      config:
      prefix === "ckb"
        ? predefined.LINA
        : predefined.AGGRON4,
    },
  );

  const transferTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return transferTx as CKBTransaction;

}
