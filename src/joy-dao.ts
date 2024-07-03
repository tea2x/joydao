import { CKBTransaction } from '@joyid/ckb'
import {
  CellDep,
  DepType,
  Address,
  Cell,
  Transaction,
  HexString,
  PackedDao,
  PackedSince,
  blockchain,
} from "@ckb-lumos/base";
import {
  INDEXER_URL,
  NODE_URL,
  DAO_MINIMUM_CAPACITY,
  MINIMUM_CHANGE_CAPACITY,
  JOYID_CELLDEP,
  OMNILOCK_CELLDEP,
  FEE_RATE,
  MAX_TX_SIZE,
} from "./config";
import {
  addressToScript,
  TransactionSkeleton,
  createTransactionFromSkeleton,
  TransactionSkeletonType,
} from "@ckb-lumos/helpers";
import { dao, common } from "@ckb-lumos/common-scripts";
import { Indexer, CellCollector } from "@ckb-lumos/ckb-indexer";
import {
  getBlockHash,
  ckbytesToShannons,
  intToHex,
  hexToInt,
  collectInputs,
  findDepositCellWith,
  addWitnessPlaceHolder,
  getFee,
  appendSubkeyDeviceCellDep,
} from "./lib/helpers";
import { number } from "@ckb-lumos/codec";
import { getConfig, Config } from "@ckb-lumos/config-manager";
import { BI, BIish } from "@ckb-lumos/bi";
import { RPC } from "@ckb-lumos/rpc";
import { generateDefaultScriptInfos } from "@ckb-ccc/lumos-patches";
import { registerCustomLockScriptInfos } from "@ckb-lumos/common-scripts/lib/common";
import { predefined } from "@ckb-lumos/config-manager";
import { Signer } from "@ckb-ccc/core";

const DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE = BI.from(180);
const rpc = new RPC(NODE_URL);
const indexer = new Indexer(INDEXER_URL);
registerCustomLockScriptInfos(generateDefaultScriptInfos());

/*
  ckbAddress: the ckb address that has CKB, and will be used to lock your Dao deposit
  ----
  returns an array of Cells
*/
export const collectDeposits = async (ckbAddress: Address): Promise<Cell[]> => {
  let depositCells: Cell[] = [];
  const daoCellCollector = new dao.CellCollector(
    ckbAddress,
    indexer,
    "deposit"
  );
  for await (const inputCell of daoCellCollector.collect()) {
    depositCells.push(inputCell);
  }
  return depositCells;
};

/*
  ckbAddress: the ckb address that has CKB, and will be used to lock your Dao deposit
  ----
  returns an array of Cells
*/
export const collectWithdrawals = async (
  ckbAddress: Address
): Promise<Cell[]> => {
  let depositCells: Cell[] = [];
  const daoCellCollector = new dao.CellCollector(
    ckbAddress,
    indexer,
    "withdraw"
  );
  for await (const inputCell of daoCellCollector.collect()) {
    depositCells.push(inputCell);
  }
  return depositCells;
};

/*
  Buid DAO deposit raw transaction
  returns a CKB raw transaction
*/
export const buildDepositTransaction = async (
  signer:Signer,
  amount: bigint
): Promise<{tx: CKBTransaction, fee: number}> => {
  amount = ckbytesToShannons(amount);
  if (amount < ckbytesToShannons(BigInt(DAO_MINIMUM_CAPACITY))) {
    throw new Error("Minimum DAO deposit is 104 CKB.");
  }

  const prefix = await signer.client.addressPrefix;
  const fromAddresses = await signer.getAddresses();
  const configuration = prefix === "ckb" ? predefined.LINA : predefined.AGGRON4;
  let txSkeleton = new TransactionSkeleton({ cellProvider: indexer });
  
  txSkeleton = await dao.deposit(
    txSkeleton,
    fromAddresses[0],
    fromAddresses[0],
    amount,
    {
      config: configuration,
      enableNonSystemScript:true
    }
  );
  
  // txSkeleton = await addWitnessPlaceHolder(txSkeleton, joyIdAuth);

  txSkeleton = await common.payFeeByFeeRate(
    txSkeleton,
    fromAddresses,
    BigInt(FEE_RATE),
    undefined,
    {
      config: configuration,
    },
  );

  const txFee = getFee(txSkeleton);
  const daoDepositTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return {tx: daoDepositTx as CKBTransaction, fee: txFee};
};

/*
  Buid DAO withdraw raw transaction
  returns a CKB raw transaction
*/
export const buildWithdrawTransaction = async (
  signer:Signer,
  daoDepositCell: Cell
): Promise<{tx: CKBTransaction, fee: number}> => {
  const prefix = await signer.client.addressPrefix;
  const fromAddresses = await signer.getAddresses();
  const configuration = prefix === "ckb" ? predefined.LINA : predefined.AGGRON4;
  let txSkeleton = new TransactionSkeleton({ cellProvider: indexer });

  txSkeleton = await dao.withdraw(
    txSkeleton,
    daoDepositCell,
    fromAddresses[0],
    {
      config: configuration,
      enableNonSystemScript:true
    }
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

  const txFee = getFee(txSkeleton);
  const daoWithdrawTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return {tx: daoWithdrawTx as CKBTransaction, fee: txFee};
};

/*
  Buid DAO unlock raw transaction
  returns a CKB raw transaction
*/
export const buildUnlockTransaction = async (
  signer:Signer,
  daoWithdrawalCell: Cell
): Promise<{tx: CKBTransaction, fee: number}> => {
  const prefix = await signer.client.addressPrefix;
  const fromAddresses = await signer.getAddresses();
  const configuration = prefix === "ckb" ? predefined.LINA : predefined.AGGRON4;
  let txSkeleton = new TransactionSkeleton({ cellProvider: indexer });
  const daoDepositCell = await findDepositCellWith(daoWithdrawalCell);

  txSkeleton = await dao.unlock(
    txSkeleton,
    daoDepositCell,
    daoWithdrawalCell,
    fromAddresses[0],
    fromAddresses[0],
    {
      config: configuration,
    }
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

  // converting skeleton to CKB transaction
  const daoUnlockTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return {tx: daoUnlockTx as CKBTransaction, fee: 333};
};

function epochSinceCompatible({
  length,
  index,
  number,
}: {
  length: BIish;
  index: BIish;
  number: BIish;
}): BI {
  const _length = BI.from(length);
  const _index = BI.from(index);
  const _number = BI.from(number);
  return BI.from(0x20)
    .shl(56)
    .add(_length.shl(40))
    .add(_index.shl(24))
    .add(_number);
}

export function extractDaoDataCompatible(dao: PackedDao): {
  [key: string]: BI;
} {
  if (!/^(0x)?([0-9a-fA-F]){64}$/.test(dao)) {
    throw new Error("Invalid dao format!");
  }

  const len = 8 * 2;
  const hex = dao.startsWith("0x") ? dao.slice(2) : dao;

  return ["c", "ar", "s", "u"]
    .map((key, i) => {
      return {
        [key]: number.Uint64LE.unpack("0x" + hex.slice(len * i, len * (i + 1))),
      };
    })
    .reduce((result, c) => ({ ...result, ...c }), {});
}

function _checkDaoScript(config: Config): void {
  const DAO_SCRIPT = config.SCRIPTS.DAO;
  if (!DAO_SCRIPT) {
    throw new Error("Provided config does not have DAO script setup!");
  }
}

function parseEpochCompatible(epoch: BIish): {
  length: BI;
  index: BI;
  number: BI;
} {
  const _epoch = BI.from(epoch);
  return {
    length: _epoch.shr(40).and(0xfff),
    index: _epoch.shr(24).and(0xfff),
    number: _epoch.and(0xffffff),
  };
}

function getTransactionSize(txSkeleton: TransactionSkeletonType): number {
  const tx = createTransactionFromSkeleton(txSkeleton);
  return getTransactionSizeByTx(tx);
}

export function getTransactionSizeByTx(tx: Transaction): number {
  const serializedTx = blockchain.Transaction.pack(tx);
  // 4 is serialized offset bytesize
  const size = serializedTx.byteLength + 4;
  return size;
}

function calculateFeeCompatible(size: number, feeRate: BIish): BI {
  const ratio = BI.from(1000);
  const base = BI.from(size).mul(feeRate);
  const fee = base.div(ratio);
  if (fee.mul(ratio).lt(base)) {
    return fee.add(1);
  }
  return BI.from(fee);
}
