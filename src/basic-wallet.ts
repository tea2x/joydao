import { common } from "@ckb-lumos/common-scripts";
import { Address, Transaction, Cell, DepType, utils, blockchain } from "@ckb-lumos/base";
import { CKBTransaction } from '@joyid/ckb';
import { TransactionSkeleton, createTransactionFromSkeleton } from "@ckb-lumos/helpers";
import { INDEXER_URL, FEE_RATE, OMNILOCK_CELLDEP, OMNILOCK_SIGNATURE_PLACEHOLDER_DEFAULT } from "./config";
import { Indexer, CellCollector } from "@ckb-lumos/ckb-indexer";
import { generateDefaultScriptInfos } from "@ckb-ccc/lumos-patches";
import { registerCustomLockScriptInfos } from "@ckb-lumos/common-scripts/lib/common";
import { predefined } from "@ckb-lumos/config-manager";
import { Signer } from "@ckb-ccc/core";
import { CKBIndexerQueryOptions } from "@ckb-lumos/ckb-indexer/src/type";
import { addressToScript, TransactionSkeletonType } from "@ckb-lumos/helpers";
import { hexToInt, intToHex } from "./lib/helpers"
import { getConfig, Config } from "@ckb-lumos/config-manager";
const { computeScriptHash } = utils;
import { bytes } from "@ckb-lumos/codec";

const indexer = new Indexer(INDEXER_URL);
registerCustomLockScriptInfos(generateDefaultScriptInfos());

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

// this function is only for omnilock
const addWitnessPlaceHolder = (
  transaction: TransactionSkeletonType
) => {
  if (transaction.witnesses.size !== 0) {
    throw new Error(
      "This function can only be used on an empty witnesses structure."
    );
  }

  let uniqueLocks = new Set();
  for (const input of transaction.inputs) {
    let witness = "0x";
    let lockScriptWitness = "0x";

    const lockHash = computeScriptHash(input.cellOutput.lock);
    if (!uniqueLocks.has(lockHash)) {
      uniqueLocks.add(lockHash);

      lockScriptWitness = OMNILOCK_SIGNATURE_PLACEHOLDER_DEFAULT;

      witness = bytes.hexify(
        blockchain.WitnessArgs.pack({
          lock: lockScriptWitness
        })
      );
    }
    transaction = transaction.update("witnesses", (w) => w.push(witness));
  }

  return transaction;
};

// Only for non-joyid options
export const buildTransfer = async (
  signer:Signer,
  to: Address,
  amount: string
): Promise<CKBTransaction> => {
  if (!signer)
    throw new Error("Wallet disconnected. Reconnect!");

  const prefix = await signer.client.addressPrefix;
  const fromAddresses = await signer.getAddresses();
  const configuration = prefix === "ckb" ? predefined.LINA : predefined.AGGRON4;

  let txSkeleton = new TransactionSkeleton({cellProvider: indexer});
  txSkeleton = await common.transfer(
    txSkeleton,
    fromAddresses,
    to,
    fixedPointFrom(amount),
    undefined,
    undefined,
    {
      config: configuration,
    },
  );

  txSkeleton = await common.payFeeByFeeRate(
    txSkeleton,
    fromAddresses,
    BigInt(FEE_RATE),
    undefined,
    {
      config: configuration,
    },
  );

  const transferTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return transferTx as CKBTransaction;
}
