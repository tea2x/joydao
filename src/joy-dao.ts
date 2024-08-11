import { Signer } from "@ckb-ccc/core";
import { CKBTransaction } from "@joyid/ckb";
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { predefined } from "@ckb-lumos/config-manager";
import { dao, common } from "@ckb-lumos/common-scripts";
import { Address, Cell, Transaction } from "@ckb-lumos/base";
import { unlock } from "./lumos-patcher"; // TODO to be replaced
import { generateDefaultScriptInfos } from "@ckb-ccc/lumos-patches";
import { INDEXER_URL, DAO_MINIMUM_CAPACITY, FEE_RATE } from "./config";
import { registerCustomLockScriptInfos } from "@ckb-lumos/common-scripts/lib/common";

import {
  TransactionSkeleton,
  createTransactionFromSkeleton,
} from "@ckb-lumos/helpers";
import {
  ckbytesToShannons,
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


/**
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

  txSkeleton = await unlock(
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
    txSkeleton = await unlock(txSkeleton, fromAddresses[0], cell as Cell);
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
