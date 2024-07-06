import { Signer } from "@ckb-ccc/core";
import { CKBTransaction } from '@joyid/ckb'
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { predefined } from "@ckb-lumos/config-manager";
import { dao, common } from "@ckb-lumos/common-scripts";
import { Address, Cell, Transaction } from "@ckb-lumos/base";
import { generateDefaultScriptInfos } from "@ckb-ccc/lumos-patches";
import { INDEXER_URL, DAO_MINIMUM_CAPACITY, FEE_RATE } from "./config";
import { registerCustomLockScriptInfos } from "@ckb-lumos/common-scripts/lib/common";
import { TransactionSkeleton, createTransactionFromSkeleton } from "@ckb-lumos/helpers";
import { ckbytesToShannons, findDepositCellWith, workAroundWitness, getFee, DaoCell } from "./lib/helpers";

const indexer = new Indexer(INDEXER_URL);
registerCustomLockScriptInfos(generateDefaultScriptInfos());

/*
  returns an array of deposit cells
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
}

/*
  returns an array of withdrawal cells
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
}

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

  // patching joyID tx fee and lumos::common-script::dao::unlock
  txSkeleton = workAroundWitness(txSkeleton);

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
}

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

  // patching joyID tx fee and lumos::common-script::dao::unlock
  txSkeleton = workAroundWitness(txSkeleton);

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
}

// /*
//   WIP - lumos common script unlock doesn't cover joyID
//   Buid DAO unlock raw transaction
//   returns a CKB raw transaction
// */
// export const buildUnlockTransaction = async (
//   signer:Signer,
//   daoWithdrawalCell: Cell
// ): Promise<{tx: CKBTransaction, fee: number}> => {
//   const prefix = await signer.client.addressPrefix;
//   const fromAddresses = await signer.getAddresses();
//   const configuration = prefix === "ckb" ? predefined.LINA : predefined.AGGRON4;
//   let txSkeleton = new TransactionSkeleton({ cellProvider: indexer });
//   const daoDepositCell = await findDepositCellWith(daoWithdrawalCell);

//   txSkeleton = await dao.unlock(
//     txSkeleton,
//     daoDepositCell,
//     daoWithdrawalCell,
//     fromAddresses[0],
//     fromAddresses[0],
//     {
//       config: configuration,
//     }
//   );

//   // patch for joyID
//   if (signer.signType == 'JoyId') {
//     txSkeleton = await addJoyIdWitnessPlaceHolder(txSkeleton);
//   }

//   txSkeleton = await common.payFeeByFeeRate(
//     txSkeleton,
//     fromAddresses,
//     BigInt(FEE_RATE * 2),
//     undefined,
//     {
//       config: configuration,
//     },
//   );

//   const txFee = getFee(txSkeleton);
//   const daoUnlockTx: Transaction = createTransactionFromSkeleton(txSkeleton);
//   return {tx: daoUnlockTx as CKBTransaction, fee: txFee};
// }


/* WIP
  Batch deposits cells to withdraw at once
  returns a CKB raw transaction
*/
export const batchDaoCells = async (
  signer: Signer,
  cells: DaoCell[]
): Promise<{ tx: CKBTransaction; fee: number }> => {
  let txSkeleton = TransactionSkeleton({ cellProvider: indexer });
  const depositCells: DaoCell[] = cells.filter((cell) => cell.isDeposit);
  const withdrawCells: DaoCell[] = cells.filter((cell) => !cell.isDeposit);
  const prefix = await signer.client.addressPrefix;
  const fromAddresses = await signer.getAddresses();
  const configuration = prefix === "ckb" ? predefined.LINA : predefined.AGGRON4;

  // Batching deposit cells
  for (const cell of depositCells) {
    txSkeleton = await dao.withdraw(
      txSkeleton,
      cell as Cell,
      fromAddresses[0],
      {
        config: configuration,
        enableNonSystemScript: true,
      }
    );
  }

  // Batching withdrawal cells
  for (const cell in withdrawCells) {
    // WIP
  }

  // patching joyID tx fee and lumos::common-script::dao::unlock
  txSkeleton = workAroundWitness(txSkeleton);

  txSkeleton = await common.payFeeByFeeRate(
    txSkeleton,
    fromAddresses,
    BigInt(FEE_RATE),
    undefined,
    {
      config: configuration,
    }
  );

  const txFee = getFee(txSkeleton);
  const daoWithdrawTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return { tx: daoWithdrawTx as CKBTransaction, fee: txFee };
}

// TODO replace by buildUnlockTransaction function above
// temporary code for the WIP buildUnlockTransaction
import {
  CellDep,
  DepType,
  HexString,
  PackedDao,
  PackedSince,
  blockchain,
} from "@ckb-lumos/base";
import { NODE_URL, JOYID_CELLDEP, OMNILOCK_CELLDEP } from "./config";
import { addressToScript, TransactionSkeletonType } from "@ckb-lumos/helpers";
import { getBlockHash, intToHex } from "./lib/helpers";
import { number } from "@ckb-lumos/codec";
import { getConfig, Config } from "@ckb-lumos/config-manager";
import { BI, BIish } from "@ckb-lumos/bi";
import { RPC } from "@ckb-lumos/rpc";

const DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE = BI.from(180);
const rpc = new RPC(NODE_URL);

/*
  Buid DAO unlock raw transaction
  ----
  ckbAddress: the ckb address that has CKB, and will be used to lock your Dao deposit
  daoDepositCell: the cell that locks the DAO deposit
  daoWithdrawalCell: the DAO withdrawal cell
  ----
  returns a CKB raw transaction
*/
export const buildUnlockTransaction = async (
  signer:Signer,
  daoWithdrawalCell: Cell
): Promise<{tx: CKBTransaction, fee: number}> => {
  const config = getConfig();
  _checkDaoScript(config);

  const prefix = await signer.client.addressPrefix;
  const fromAddresses = await signer.getAddresses();
  const configuration = prefix === "ckb" ? predefined.LINA : predefined.AGGRON4;
  let txSkeleton = TransactionSkeleton({ cellProvider: indexer });

  // // when a device is using joyid subkey,
  // // prioritizing Cota celldeps at the head of the celldep list
  // txSkeleton = await appendSubkeyDeviceCellDep(txSkeleton, joyIdAuth);

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

  const fromScript = addressToScript(fromAddresses[0], { config });
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

  // patching joyID tx fee and lumos::common-script::dao::unlock
  txSkeleton = workAroundWitness(txSkeleton, true);

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
        lock: addressToScript(fromAddresses[0]),
        type: undefined,
      },
      data: "0x",
      outPoint: undefined,
      blockHash: undefined,
    });
  });

  // const txFee = getFee(txSkeleton);
  // converting skeleton to CKB transaction
  const daoUnlockTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return {tx: daoUnlockTx as CKBTransaction, fee: fee};
}

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
