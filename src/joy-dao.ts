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
import { ckbytesToShannons, findDepositCellWith, addJoyIdWitnessPlaceHolder, getFee } from "./lib/helpers";

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
};

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

  // patch for joyID
  if (signer.signType == 'JoyId') {
    txSkeleton = await addJoyIdWitnessPlaceHolder(txSkeleton);
  }

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

  // patch for joyID
  if (signer.signType == 'JoyId') {
    txSkeleton = await addJoyIdWitnessPlaceHolder(txSkeleton);
  }

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

  console.log(">>>txSkeleton before: ", JSON.stringify(txSkeleton, null, 2))

  // patch for joyID
  if (signer.signType == 'JoyId') {
    txSkeleton = await addJoyIdWitnessPlaceHolder(txSkeleton);
  }

  txSkeleton = await common.payFeeByFeeRate(
    txSkeleton,
    fromAddresses,
    BigInt(FEE_RATE * 2),
    undefined,
    {
      config: configuration,
    },
  );

  console.log(">>>txSkeleton after: ", JSON.stringify(txSkeleton, null, 2))

  const txFee = getFee(txSkeleton);
  const daoUnlockTx: Transaction = createTransactionFromSkeleton(txSkeleton);
  return {tx: daoUnlockTx as CKBTransaction, fee: txFee};
};
