import { Signer } from "@ckb-ccc/core";
import { CKBTransaction } from "@joyid/ckb";
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { predefined } from "@ckb-lumos/config-manager";
import { dao, common } from "@ckb-lumos/common-scripts";
import { generateDefaultScriptInfos } from "@ckb-ccc/lumos-patches";
import { INDEXER_URL, DAO_MINIMUM_CAPACITY, FEE_RATE } from "./config";
import { Address, Cell, Transaction, WitnessArgs } from "@ckb-lumos/base";
import { registerCustomLockScriptInfos } from "@ckb-lumos/common-scripts/lib/common";
import {
  TransactionSkeleton,
  createTransactionFromSkeleton,
} from "@ckb-lumos/helpers";
import {
  ckbytesToShannons,
  findDepositCellWith,
  insertJoyIdWithnessPlaceHolder,
  getFee,
  DaoCell,
  hexToInt,
  isJoyIdAddress,
} from "./lib/helpers";

const indexer = new Indexer(INDEXER_URL);
registerCustomLockScriptInfos(generateDefaultScriptInfos());

/**
 * Fetch DAO deposits.
 *
 * @param ckbAddress - The ckb address.
 * @returns An array of deposit cells.
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

/**
 * Fetch DAO withdrawals.
 *
 * @param ckbAddress - The ckb address.
 * @returns An array of withdrawal cells.
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

/**
 * Buid DAO deposit transaction.
 *
 * @param signer - The transaction signer.
 * @param amount - The amount to deposit.
 * @returns A CKB raw transaction.
 */
export const buildDepositTransaction = async (
  signer: Signer,
  amount: bigint
): Promise<{ tx: CKBTransaction; fee: number }> => {
  amount = ckbytesToShannons(amount);
  if (amount < ckbytesToShannons(BigInt(DAO_MINIMUM_CAPACITY)))
    throw new Error("Minimum DAO deposit is 104 CKB.");

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
      enableNonSystemScript: true,
    }
  );

  // patching joyID tx fee and lumos::common-script::dao::unlock
  if (isJoyIdAddress(fromAddresses[0]))
    txSkeleton = insertJoyIdWithnessPlaceHolder(txSkeleton);

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
  const daoDepositTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return { tx: daoDepositTx as CKBTransaction, fee: txFee };
};

/**
 * Buid DAO withdraw raw transaction.
 *
 * @param signer - The transaction signer.
 * @param daoDepositCell - The deposit cell.
 * @returns A CKB raw transaction.
 */
export const buildWithdrawTransaction = async (
  signer: Signer,
  daoDepositCell: Cell
): Promise<{ tx: CKBTransaction; fee: number }> => {
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
      enableNonSystemScript: true,
    }
  );

  // patching joyID tx fee and lumos::common-script::dao::unlock
  if (isJoyIdAddress(fromAddresses[0]))
    txSkeleton = insertJoyIdWithnessPlaceHolder(txSkeleton);

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
};

// /**
//  * WIP - lumos::common-script unlock doesn't cover joyID yet
//  * Buid DAO unlock raw transaction.
//  *
//  * @param signer - The transaction signer.
//  * @param daoWithdrawalCell - The withdrawal cell.
//  * @returns A CKB raw transaction.
//  */
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

/**
 * Batch deposits or/with cells to withdraw or/and unlock at once.
 *
 * @param signer - The transaction signer.
 * @param cells - An array of deposit cells or/with at-end-cycle withdrawal cells.
 * @returns A CKB raw transaction.
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

  // patching joyID tx fee and lumos::common-script::dao::unlock
  if (isJoyIdAddress(fromAddresses[0]))
    txSkeleton = insertJoyIdWithnessPlaceHolder(txSkeleton);

  // Batching withdrawal cells
  for (const cell of withdrawCells) {
    //TODO replace when lumos supports joyID for dao unlocking
    txSkeleton = await _daoUnlock(txSkeleton, fromAddresses[0], cell as Cell);
  }

  // patching joyID tx fee and lumos::common-script::dao::unlock
  if (isJoyIdAddress(fromAddresses[0]))
    txSkeleton = insertJoyIdWithnessPlaceHolder(txSkeleton);

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
};

//////////////////////////////////////////////////////////////////////////////////////////
// TODO replace the following by the commented buildUnlockTransaction function above
// when lumos fully support joyID unlocking
// This is a temporary code since lumos::common-script::unlock doesn't work with joyID
//////////////////////////////////////////////////////////////////////////////////////////
import {
  CellDep,
  DepType,
  HexString,
  PackedSince,
  blockchain,
  values,
} from "@ckb-lumos/base";
import { RPC } from "@ckb-lumos/rpc";
import { BI, BIish } from "@ckb-lumos/bi";
import { getBlockHash } from "./lib/helpers";
import { bytes, number } from "@ckb-lumos/codec";
import { getConfig } from "@ckb-lumos/config-manager";
import { NODE_URL, JOYID_CELLDEP, OMNILOCK_CELLDEP } from "./config";
import { addressToScript, TransactionSkeletonType } from "@ckb-lumos/helpers";

const DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE = BI.from(180);
const rpc = new RPC(NODE_URL);

/**
 * Add celldep to transaction.
 */
function _addCellDep(
  txSkeleton: TransactionSkeletonType,
  newCellDep: CellDep
): TransactionSkeletonType {
  const cellDep = txSkeleton.get("cellDeps").find((cellDep) => {
    return (
      cellDep.depType === newCellDep.depType &&
      new values.OutPointValue(cellDep.outPoint, { validate: false }).equals(
        new values.OutPointValue(newCellDep.outPoint, { validate: false })
      )
    );
  });

  if (!cellDep) {
    txSkeleton = txSkeleton.update("cellDeps", (cellDeps) => {
      return cellDeps.push({
        outPoint: newCellDep.outPoint,
        depType: newCellDep.depType,
      });
    });
  }

  return txSkeleton;
}

/**
 * Generate DAO unlock transaction structure with zero fee added.
 * This is a modified version and a temporary replacement for
 * lumos::common-script::unlock function
 */
const _daoUnlock = async (
  txSkeleton: TransactionSkeletonType,
  fromAddress: Address,
  daoWithdrawalCell: Cell
): Promise<TransactionSkeletonType> => {
  const config = getConfig();
  const DAO_SCRIPT = config.SCRIPTS.DAO;
  if (!DAO_SCRIPT)
    throw new Error("Provided config does not have DAO script setup!");

  // add celldeps
  const template = config.SCRIPTS.DAO!;
  const daoCellDep = {
    outPoint: {
      txHash: template.TX_HASH,
      index: template.INDEX,
    },
    depType: template.DEP_TYPE,
  };

  txSkeleton = _addCellDep(txSkeleton, daoCellDep);

  const fromScript = addressToScript(fromAddress, { config });
  if (fromScript.codeHash == JOYID_CELLDEP.codeHash) {
    txSkeleton = _addCellDep(txSkeleton, {
      outPoint: JOYID_CELLDEP.outPoint,
      depType: JOYID_CELLDEP.depType as DepType,
    });
  } else if (fromScript.codeHash == OMNILOCK_CELLDEP.codeHash) {
    txSkeleton = _addCellDep(txSkeleton, {
      outPoint: OMNILOCK_CELLDEP.outPoint,
      depType: OMNILOCK_CELLDEP.depType as DepType,
    });

    txSkeleton = _addCellDep(txSkeleton, {
      outPoint: {
        txHash: config.SCRIPTS.SECP256K1_BLAKE160!.TX_HASH,
        index: config.SCRIPTS.SECP256K1_BLAKE160!.INDEX,
      },
      depType: config.SCRIPTS.SECP256K1_BLAKE160?.DEP_TYPE as DepType,
    });
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
  const depositEpoch = _parseEpochCompatible(depositBlockHeader!.epoch);
  const withdrawEpoch = _parseEpochCompatible(withdrawBlockHeader!.epoch);

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
  const minimalSince = _epochSinceCompatible(minimalSinceEpoch);
  const since: PackedSince = "0x" + minimalSince.toString(16);

  // adding dao withdrawal cell as the first input
  txSkeleton = txSkeleton.update("inputs", (i) => i.push(daoWithdrawalCell));
  if (since) {
    txSkeleton = txSkeleton.update("inputSinces", (inputSinces) => {
      return inputSinces.set(txSkeleton.get("inputs").size - 1, since);
    });
  }

  // add dao unlock header deps
  txSkeleton = txSkeleton.update("headerDeps", (headerDeps) => {
    return headerDeps.push(
      daoDepositCell.blockHash!,
      daoWithdrawalCell.blockHash!
    );
  });

  // add dao unlock witness
  const depositHeaderDepIndex = txSkeleton.get("headerDeps").size - 2;
  const defaultWitnessArgs: WitnessArgs = {
    inputType: bytes.hexify(number.Uint64LE.pack(depositHeaderDepIndex)),
  };
  const defaultWitness: HexString = bytes.hexify(
    blockchain.WitnessArgs.pack(defaultWitnessArgs)
  );
  txSkeleton = txSkeleton.update("witnesses", (witnesses) => {
    return witnesses.push(defaultWitness);
  });

  // adding output
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
        capacity: outputCapacity,
        lock: addressToScript(fromAddress),
        type: undefined,
      },
      data: "0x",
      outPoint: undefined,
      blockHash: undefined,
    });
  });

  return txSkeleton;
};

/**
 * WIP - lumos::common-script unlock doesn't cover joyID yet
 * Buid DAO unlock raw transaction.
 *
 * @param signer - The transaction signer.
 * @param daoWithdrawalCell - The withdrawal cell.
 * @returns A CKB raw transaction.
 */
export const buildUnlockTransaction = async (
  signer: Signer,
  daoWithdrawalCell: Cell
): Promise<{ tx: CKBTransaction; fee: number }> => {
  const prefix = await signer.client.addressPrefix;
  const fromAddresses = await signer.getAddresses();
  const configuration = prefix === "ckb" ? predefined.LINA : predefined.AGGRON4;
  let txSkeleton = TransactionSkeleton({ cellProvider: indexer });

  txSkeleton = await _daoUnlock(
    txSkeleton,
    fromAddresses[0],
    daoWithdrawalCell
  );

  // patching joyID tx fee and lumos::common-script::dao::unlock
  if (isJoyIdAddress(fromAddresses[0]))
    txSkeleton = insertJoyIdWithnessPlaceHolder(txSkeleton);

  const inputCapacity = txSkeleton.inputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));
  const outputCapacity = txSkeleton.outputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));
  const reward = outputCapacity - inputCapacity;

  txSkeleton = await common.payFeeByFeeRate(
    txSkeleton,
    fromAddresses,
    BigInt(FEE_RATE),
    undefined,
    {
      config: configuration,
    }
  );

  const txFee = getFee(txSkeleton, reward);
  const daoUnlockTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return { tx: daoUnlockTx as CKBTransaction, fee: txFee };
};

/**
 * _daoUnlock helper
 */
function _epochSinceCompatible({
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

/**
 * _daoUnlock helper
 */
function _parseEpochCompatible(epoch: BIish): {
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
