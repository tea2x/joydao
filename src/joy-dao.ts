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
import { dao } from "@ckb-lumos/common-scripts";
import { Indexer, CellCollector } from "@ckb-lumos/ckb-indexer";
import {
  getBlockHash,
  ckbytesToShannons,
  intToHex,
  hexToInt,
  collectInputs,
  findDepositCellWith,
  addWitnessPlaceHolder,
  extraFeeCheck,
  appendSubkeyDeviceCellDep,
} from "./lib/helpers";
import { number } from "@ckb-lumos/codec";
import { getConfig, Config } from "@ckb-lumos/config-manager";
import { BI, BIish } from "@ckb-lumos/bi";
import { RPC } from "@ckb-lumos/rpc";

const DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE = BI.from(180);
const rpc = new RPC(NODE_URL);
const indexer = new Indexer(INDEXER_URL);

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
  ----
  ckbAddress: the ckb address that has CKB, and will be used to lock your Dao deposit
  amount: the amount to deposit to the DAO in CKB
  joyIdAuth: joyid authReponseData
  ----
  returns a CKB raw transaction
*/
export const buildDepositTransaction = async (
  ckbAddress: Address,
  amount: bigint,
  joyIdAuth: any = null
): Promise<CKBTransaction> => {
  amount = ckbytesToShannons(amount);
  if (amount < ckbytesToShannons(BigInt(DAO_MINIMUM_CAPACITY))) {
    throw new Error("Mimum DAO deposit is 104 CKB.");
  }

  let txSkeleton = TransactionSkeleton({ cellProvider: indexer });
  
  // when a device is using joyid subkey,
  // prioritizing Cota celldeps at the head of the celldep list
  txSkeleton = await appendSubkeyDeviceCellDep(txSkeleton, joyIdAuth);
  
  // generating basic dao transaction skeleton
  txSkeleton = await dao.deposit(txSkeleton, ckbAddress, ckbAddress, amount);

  // adding cell deps
  const config = getConfig();
  const fromScript = addressToScript(ckbAddress, { config });
  if (fromScript.codeHash == JOYID_CELLDEP.codeHash) {
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: JOYID_CELLDEP.outPoint,
        depType: JOYID_CELLDEP.depType as DepType,
      })
    );
  } else if (fromScript.codeHash == OMNILOCK_CELLDEP.codeHash) {
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: OMNILOCK_CELLDEP.outPoint,
        depType: OMNILOCK_CELLDEP.depType as DepType,
      })
    );

    // omnilock needs secp256k1 celldep
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: {
          txHash: config.SCRIPTS.SECP256K1_BLAKE160!.TX_HASH,
          index: config.SCRIPTS.SECP256K1_BLAKE160!.INDEX,
        },
        depType: config.SCRIPTS.SECP256K1_BLAKE160?.DEP_TYPE as DepType,
      })
    );
  } else {
    throw new Error("Only joyId and omnilock addresses are supported");
  }

  // calculating fee for a really large dummy tx (^100 inputs) and adding input capacity cells
  let fee = calculateFeeCompatible(MAX_TX_SIZE, FEE_RATE).toNumber();
  const requiredCapacity =
    amount + ckbytesToShannons(BigInt(MINIMUM_CHANGE_CAPACITY)) + BigInt(fee);

  const collectedInputs = await collectInputs(
    indexer,
    addressToScript(ckbAddress),
    requiredCapacity
  );
  txSkeleton = txSkeleton.update("inputs", (i) =>
    i.concat(collectedInputs.inputCells)
  );

  txSkeleton = await addWitnessPlaceHolder(txSkeleton, joyIdAuth);

  // Regulating fee, and making a change cell
  // 111 is the size difference adding the 1 anticipated change cell
  // TODO because payFeeByRate is not generalized enough for different signing standards,
  // here applied a trick to achieve the function of configurable FeeRate.
  // joyID witnesses from different devices with different sizes, can cause
  // feeRate by this trick, diviate slightly from the calculated fee but it's considered safe.
  const txSize = getTransactionSize(txSkeleton) + 111;
  fee = calculateFeeCompatible(txSize, FEE_RATE).toNumber();
  const outputCapacity = txSkeleton.outputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));
  const changeCellCapacity =
    collectedInputs.inputCapacity - outputCapacity - BigInt(fee);
  let change: Cell = {
    cellOutput: {
      capacity: intToHex(changeCellCapacity),
      lock: addressToScript(ckbAddress),
    },
    data: "0x",
  };

  txSkeleton = txSkeleton.update("outputs", (i) => i.push(change));
  // safe check
  extraFeeCheck(txSkeleton);

  const daoDepositTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return daoDepositTx as CKBTransaction;
};

/*
  Buid DAO withdraw raw transaction
  ----
  ckbAddress: the ckb address that has CKB, and will be used to lock your Dao deposit
  daoDepositCell: the cell that locks the DAO deposit
  joyIdAuth: joyid authReponseData
  ----
  returns a CKB raw transaction
*/
export const buildWithdrawTransaction = async (
  ckbAddress: Address,
  daoDepositCell: Cell,
  joyIdAuth: any = null
): Promise<CKBTransaction> => {
  let txSkeleton = TransactionSkeleton({ cellProvider: indexer });

  // when a device is using joyid subkey,
  // prioritizing Cota celldeps at the head of the celldep list
  txSkeleton = await appendSubkeyDeviceCellDep(txSkeleton, joyIdAuth);

  // adding cell deps
  const config = getConfig();
  const fromScript = addressToScript(ckbAddress, { config });
  if (fromScript.codeHash == JOYID_CELLDEP.codeHash) {
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: JOYID_CELLDEP.outPoint,
        depType: JOYID_CELLDEP.depType as DepType,
      })
    );
  } else if (fromScript.codeHash == OMNILOCK_CELLDEP.codeHash) {
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: OMNILOCK_CELLDEP.outPoint,
        depType: OMNILOCK_CELLDEP.depType as DepType,
      })
    );

    // omnilock needs secp256k1 celldep
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: {
          txHash: config.SCRIPTS.SECP256K1_BLAKE160!.TX_HASH,
          index: config.SCRIPTS.SECP256K1_BLAKE160!.INDEX,
        },
        depType: config.SCRIPTS.SECP256K1_BLAKE160?.DEP_TYPE as DepType,
      })
    );
  } else {
    throw new Error("Only joyId and omnilock addresses are supported");
  }

  // add dao input cell
  txSkeleton = txSkeleton.update("inputs", (i) => i.push(daoDepositCell));

  // add dao output cell
  const daoOutputCell: Cell = {
    cellOutput: {
      capacity: daoDepositCell.cellOutput.capacity,
      lock: daoDepositCell.cellOutput.lock,
      type: daoDepositCell.cellOutput.type,
    },
    data: "0x", // dao.withdraw will fill in
  };
  txSkeleton = txSkeleton.update("outputs", (i) => i.push(daoOutputCell));

  // generate the dao withdraw skeleton
  txSkeleton = await dao.withdraw(txSkeleton, daoDepositCell, ckbAddress);

  // calculating fee for a really large dummy tx (^100 inputs) and adding input capacity cells
  let fee = calculateFeeCompatible(MAX_TX_SIZE, FEE_RATE).toNumber();
  const requiredCapacity =
    ckbytesToShannons(BigInt(MINIMUM_CHANGE_CAPACITY)) + BigInt(fee);
  const collectedInputs = await collectInputs(
    indexer,
    addressToScript(ckbAddress),
    requiredCapacity
  );
  txSkeleton = txSkeleton.update("inputs", (i) =>
    i.concat(collectedInputs.inputCells)
  );

  txSkeleton = await addWitnessPlaceHolder(txSkeleton, joyIdAuth);

  // Regulating fee, and making a change cell
  // 111 is the size difference adding the 1 anticipated change cell
  const txSize = getTransactionSize(txSkeleton) + 111;
  fee = calculateFeeCompatible(txSize, FEE_RATE).toNumber();
  const outputCapacity = txSkeleton.outputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));
  const inputCapacity = txSkeleton.inputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));
  const changeCellCapacity = inputCapacity - outputCapacity - BigInt(fee);
  let change: Cell = {
    cellOutput: {
      capacity: intToHex(changeCellCapacity),
      lock: addressToScript(ckbAddress),
    },
    data: "0x",
  };

  txSkeleton = txSkeleton.update("outputs", (i) => i.push(change));
  // safe check
  extraFeeCheck(txSkeleton);

  const daoWithdrawTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return daoWithdrawTx as CKBTransaction;
};

/*
  Buid DAO unlock raw transaction
  ----
  ckbAddress: the ckb address that has CKB, and will be used to lock your Dao deposit
  daoDepositCell: the cell that locks the DAO deposit
  daoWithdrawalCell: the DAO withdrawal cell
  joyIdAuth: joyid authReponseData
  ----
  returns a CKB raw transaction
*/
export const buildUnlockTransaction = async (
  ckbAddress: Address,
  daoWithdrawalCell: Cell,
  joyIdAuth: any = null
): Promise<CKBTransaction> => {
  const config = getConfig();
  _checkDaoScript(config);

  let txSkeleton = TransactionSkeleton({ cellProvider: indexer });

  // when a device is using joyid subkey,
  // prioritizing Cota celldeps at the head of the celldep list
  txSkeleton = await appendSubkeyDeviceCellDep(txSkeleton, joyIdAuth);

  //  adding celldeps
  const template = config.SCRIPTS.DAO!;
  const daoCellDep = {
    outPoint: {
      txHash: template.TX_HASH,
      index: template.INDEX,
    },
    depType: template.DEP_TYPE,
  };

  // dao cell dep
  txSkeleton = txSkeleton.update("cellDeps", (i) =>
    i.push(daoCellDep as CellDep)
  );

  const fromScript = addressToScript(ckbAddress, { config });
  if (fromScript.codeHash == JOYID_CELLDEP.codeHash) {
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: JOYID_CELLDEP.outPoint,
        depType: JOYID_CELLDEP.depType as DepType,
      })
    );
  } else if (fromScript.codeHash == OMNILOCK_CELLDEP.codeHash) {
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: OMNILOCK_CELLDEP.outPoint,
        depType: OMNILOCK_CELLDEP.depType as DepType,
      })
    );

    // omnilock needs secp256k1 celldep
    txSkeleton = txSkeleton.update("cellDeps", (i) =>
      i.push({
        outPoint: {
          txHash: config.SCRIPTS.SECP256K1_BLAKE160!.TX_HASH,
          index: config.SCRIPTS.SECP256K1_BLAKE160!.INDEX,
        },
        depType: config.SCRIPTS.SECP256K1_BLAKE160?.DEP_TYPE as DepType,
      })
    );
  } else {
    throw new Error("Only joyId and omnilock addresses are supported");
  }

  // find the deposit cell and
  // enrich DAO withdrawal cell data with block hash info
  const [daoDepositCell, withdrawBlkHash] = await Promise.all([
    findDepositCellWith(daoWithdrawalCell),
    getBlockHash(daoWithdrawalCell.blockNumber!),
  ]);
  daoWithdrawalCell.blockHash = withdrawBlkHash;

  // calculate since & capacity (interest)
  const [depositBlockHeader, withdrawBlockHeader] = await Promise.all([
    rpc.getHeader(daoDepositCell.blockHash!),
    rpc.getHeader(daoWithdrawalCell.blockHash!),
  ]);
  const depositEpoch = parseEpochCompatible(depositBlockHeader!.epoch);
  const withdrawEpoch = parseEpochCompatible(withdrawBlockHeader!.epoch);

  const withdrawFraction = withdrawEpoch.index.mul(depositEpoch.length);
  const depositFraction = depositEpoch.index.mul(withdrawEpoch.length);
  let depositedEpochs = withdrawEpoch.number.sub(depositEpoch.number);

  if (withdrawFraction.gt(depositFraction)) {
    depositedEpochs = depositedEpochs.add(1);
  }

  const lockEpochs = depositedEpochs
    .add(DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE)
    .sub(1)
    .div(DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE)
    .mul(DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE);
  const minimalSinceEpoch = {
    number: BI.from(depositEpoch.number.add(lockEpochs)),
    index: BI.from(depositEpoch.index),
    length: BI.from(depositEpoch.length),
  };
  const minimalSince = epochSinceCompatible(minimalSinceEpoch);
  const since: PackedSince = "0x" + minimalSince.toString(16);

  // add header deps
  txSkeleton = txSkeleton.update("headerDeps", (headerDeps) => {
    return headerDeps.push(
      daoDepositCell.blockHash!,
      daoWithdrawalCell.blockHash!
    );
  });

  // adding dao withdrawal cell as the first input
  txSkeleton = txSkeleton.update("inputs", (i) => i.push(daoWithdrawalCell));
  if (since) {
    txSkeleton = txSkeleton.update("inputSinces", (inputSinces) => {
      return inputSinces.set(txSkeleton.get("inputs").size - 1, since);
    });
  }

  txSkeleton = await addWitnessPlaceHolder(txSkeleton, joyIdAuth);

  // substract fee based on fee rate from the deposit
  const txSize = getTransactionSize(txSkeleton) + 111;
  const fee = calculateFeeCompatible(txSize, FEE_RATE).toNumber();
  const outputCapacity: HexString =
    "0x" +
    dao
      .calculateMaximumWithdrawCompatible(
        daoWithdrawalCell,
        depositBlockHeader!.dao,
        withdrawBlockHeader!.dao
      )
      .toString(16);

  txSkeleton = txSkeleton.update("outputs", (outputs) => {
    return outputs.push({
      cellOutput: {
        capacity: intToHex(BigInt(parseInt(outputCapacity, 16) - fee)),
        lock: addressToScript(ckbAddress),
        type: undefined,
      },
      data: "0x",
      outPoint: undefined,
      blockHash: undefined,
    });
  });

  // safe check
  extraFeeCheck(txSkeleton);
  // converting skeleton to CKB transaction
  const daoUnlockTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return daoUnlockTx as CKBTransaction;
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
