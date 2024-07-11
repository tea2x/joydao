import { RPC } from "@ckb-lumos/lumos";
import {
  Script,
  Address,
  Cell,
  Transaction,
  since,
  blockchain,
  PackedDao,
  WitnessArgs,
} from "@ckb-lumos/base";
const { parseSince } = since;
import {
  NODE_URL,
  INDEXER_URL,
  CKB_SHANNON_RATIO,
  JOYID_CELLDEP,
  OMNILOCK_CELLDEP,
  JOYID_SIGNATURE_PLACEHOLDER_DEFAULT,
  DAO_MINIMUM_CAPACITY,
  NETWORK_CONFIG,
} from "../config";
import { addressToScript, TransactionSkeletonType } from "@ckb-lumos/helpers";
import { CKBIndexerQueryOptions } from "@ckb-lumos/ckb-indexer/src/type";
import { TerminableCellFetcher } from "@ckb-lumos/ckb-indexer/src/type";
import { CellCollector, Indexer } from "@ckb-lumos/ckb-indexer";
import { getConfig } from "@ckb-lumos/config-manager";
import { dao } from "@ckb-lumos/common-scripts";
import { EpochSinceValue } from "@ckb-lumos/base/lib/since";
import { BI, BIish } from "@ckb-lumos/bi";
import { bytes, number } from "@ckb-lumos/codec";
import { BytesLike } from "@ckb-ccc/core";

const INDEXER = new Indexer(INDEXER_URL);
const rpc = new RPC(NODE_URL);

export interface Balance {
  available: string;
  occupied: string;
}

export interface DaoCell extends Cell {
  isDeposit: boolean; // deposit/withdraw
  depositEpoch: number;
  sinceEpoch: number;
  maximumWithdraw: string;
  ripe: boolean;
  completedCycles: number;
  currentCycleProgress: number;
  cycleEndInterval: number; //epoch
}

/**
 * Get block hash based on block number.
 *
 * @param blockNumber - CKB block number.
 * @returns Block hash.
 */
export async function getBlockHash(blockNumber: string) {
  const blockHash = await rpc.getBlockHash(blockNumber);
  return blockHash;
}

/**
 * Convert from CKB to Shannon.
 *
 * @param ckbytes - The CKB amount.
 * @returns The shannon ammount.
 */
export function ckbytesToShannons(ckbytes: bigint) {
  ckbytes = BigInt(ckbytes);

  return ckbytes * BigInt(CKB_SHANNON_RATIO);
}

/**
 * Convert integer to hex string.
 *
 * @param intValue - The integer number.
 * @returns The converted hex string.
 */
export function intToHex(intValue: bigint): string {
  if (typeof intValue !== "bigint") {
    throw new Error("Input value must be a BigInt");
  }

  let hexString = (intValue >= 0 ? "" : "-") + intValue.toString(16);

  if (intValue < 0) {
    console.warn("Warning: A negative value was passed to intToHex()");
  }

  return "0x" + hexString;
}

/**
 * Convert hex string to integer.
 *
 * @param intValue - The hex string.
 * @returns The converted bigint.
 */
export function hexToInt(hex: string) {
  hex = String(hex);
  if (hex.substr(0, 2) !== "0x" && hex.substr(0, 3) !== "-0x")
    throw new Error(`Invalid hex value: "${hex}"`);

  const negative = hex[0] === "-";
  const hexValue = hex.replace("-", "");
  let bigInt = BigInt(hexValue);
  if (negative) bigInt *= BigInt(-1);

  if (negative)
    console.warn("Warning: A negative value was passed to hexToInt()");

  return bigInt;
}

/**
 * Query balance and DAO status.
 *
 * @param ckbAddress - The ckb address.
 * @returns An object typed Balance.
 */
export const queryBalance = async (ckbAddress: Address): Promise<Balance> => {
  const ret: Balance = { available: "", occupied: "" };

  // query available balance
  let query: CKBIndexerQueryOptions = {
    lock: addressToScript(ckbAddress),
    type: "empty",
  };
  const cellCollector = new CellCollector(INDEXER, query);
  let balance = BigInt(0);
  for await (const cell of cellCollector.collect()) {
    balance += hexToInt(cell.cellOutput.capacity);
  }
  ret.available = balance.toString();

  // query dao capacity locked in
  const config = getConfig();
  const DAO_SCRIPT = config.SCRIPTS.DAO;
  if (!DAO_SCRIPT) {
    throw new Error("Provided config does not have DAO script setup!");
  }
  const daoQuery: CKBIndexerQueryOptions = {
    lock: addressToScript(ckbAddress),
    type: {
      codeHash: DAO_SCRIPT.CODE_HASH,
      hashType: DAO_SCRIPT.HASH_TYPE,
      args: "0x",
    },
  };

  const daoCellCollector = new CellCollector(INDEXER, daoQuery);
  balance = BigInt(0);
  for await (const cell of daoCellCollector.collect()) {
    balance += hexToInt(cell.cellOutput.capacity);
  }
  ret.occupied = balance.toString();

  return ret;
};

/**
 * Find deposit cell based on a withdrawal cell.
 *
 * @param withdrawalCell - The Withdrawal cell based on which the deposit cell is searched.
 * @returns The trace of the deposit cell.
 */
export const findDepositCellWith = async (
  withdrawalCell: Cell
): Promise<Cell> => {
  const withdrawPhase1TxRecord: any = await rpc.getTransaction(
    withdrawalCell.outPoint!.txHash
  );
  const depositCellTrace =
    withdrawPhase1TxRecord.transaction.inputs[
      parseInt(withdrawalCell.outPoint!.index, 16)
    ];

  const depositTxRecord: any = await rpc.getTransaction(
    depositCellTrace.previousOutput.txHash
  );
  const depositCellOutput: any =
    depositTxRecord.transaction.outputs[
      parseInt(depositCellTrace.previousOutput.index, 16)
    ];

  let retCell: Cell = {
    cellOutput: {
      capacity: depositCellOutput.capacity,
      lock: depositCellOutput.lock,
      type: depositCellOutput.type,
    },
    data: depositTxRecord.transaction.outputsData[
      parseInt(depositCellTrace.previousOutput.index, 16)
    ],
    blockHash: depositTxRecord.txStatus.blockHash,
    outPoint: depositCellTrace.previousOutput,
  };

  return retCell;
};

/**
 * Query transaction and check status.
 */
async function waitForConfirmation(
  txid: string,
  updateProgress = (_status: any) => {},
  options: any
) {
  const defaults = {
    timeoutMs: 300_000,
    recheckMs: 250,
    throwOnNotFound: true,
  };
  options = { ...defaults, ...options };

  return new Promise<void>(async (resolve, reject) => {
    let timedOut = false;
    const timeoutTimer =
      options.timeoutMs !== 0
        ? setTimeout(() => {
            timedOut = true;
          }, options.timeoutMs)
        : false;

    while (true) {
      if (timedOut) return reject(Error("Transaction timeout."));

      const transaction = await rpc.getTransaction(txid);

      if (!!transaction) {
        const status = transaction.txStatus.status;

        updateProgress(status);

        if (status === "committed") {
          if (timeoutTimer) clearTimeout(timeoutTimer);

          break;
        }
      } else if (transaction === null) {
        if (options.throwOnNotFound)
          return reject(Error("Transaction was not found."));
        else updateProgress("not_found");
      }

      await new Promise((resolve) => setTimeout(resolve, options.recheckMs));
    }

    return resolve();
  });
}

/**
 * Wait for transaction confirmation.
 *
 * @param txid - The transaction id / transaction hash.
 * @returns none.
 */
export async function waitForTransactionConfirmation(txid: string) {
  console.log("Waiting for transaction to confirm.");
  await waitForConfirmation(txid, (_status) => console.log("."), {
    recheckMs: 3_000,
  });
}

/**
 * Decode epoch into a readable object.
 */
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

/**
 * Enrich deposit information for UI control.
 *
 * @param cell - The deposit/withdraw cell.
 * @param isDeposit - Is this a deposit or a withdraw?
 * @param tipEpoch - The CKB blockchain tip epoch
 * @returns A CKB raw transaction.
 */
export const enrichDaoCellInfo = async (
  cell: DaoCell,
  isDeposit: boolean,
  tipEpoch: number
) => {
  if (cell.isDeposit == null) {
    cell.isDeposit = isDeposit;
    cell.blockHash = await getBlockHash(cell.blockNumber!);

    let depositBlockHeader;
    if (isDeposit) {
      depositBlockHeader = await rpc.getHeader(cell.blockHash!);
      cell.depositEpoch = parseEpochCompatible(
        depositBlockHeader.epoch
      ).number.toNumber();

      const mod = (tipEpoch - cell.depositEpoch) % 180;
      // best interest + safest time (before the deposit enters another locking cycle)
      // to make a withdraw is in epoch range (168,180]  of the current cycle which is
      // about 12 epochs ~ 2 days
      cell.ripe = mod >= 168 && mod < 180 ? true : false;
    } else {
      const daoDepositCell = await findDepositCellWith(cell);
      const [depositBlockHeader, withdrawBlockHeader] = await Promise.all([
        rpc.getHeader(daoDepositCell.blockHash!),
        rpc.getHeader(cell.blockHash!),
      ]);
      cell.depositEpoch = parseEpochCompatible(
        depositBlockHeader.epoch
      ).number.toNumber();
      const withdrawEpoch = parseEpochCompatible(
        withdrawBlockHeader.epoch
      ).number.toNumber();

      // TODO ripe can also be calculated as Math.ceil( (w-d)/180 ) * 180 + d + 1
      const earliestSince = dao.calculateDaoEarliestSince(
        depositBlockHeader.epoch,
        withdrawBlockHeader.epoch
      );
      const parsedSince = parseSince(earliestSince.toString());
      cell.sinceEpoch = (parsedSince.value as EpochSinceValue).number;
      cell.maximumWithdraw = dao
        .calculateMaximumWithdraw(
          cell,
          depositBlockHeader.dao,
          withdrawBlockHeader.dao
        )
        .toString();
      cell.ripe = tipEpoch > cell.sinceEpoch;
    }

    // enrich deposit info
    const step = tipEpoch - cell.depositEpoch;
    cell.completedCycles = Math.floor(step / 180);
    if (isDeposit == false && cell.ripe) {
      // when unlocking period arrives, current cycle halt at 100%
      cell.currentCycleProgress = 100;
    } else {
      cell.currentCycleProgress = Math.floor(((step % 180) * 100) / 180);
    }
    cell.cycleEndInterval = 180 - (step % 180);
  }
};

/**
 * Fetch tip epoch from CKB and return it
 */
export const getTipEpoch = async (): Promise<number> => {
  const currentEpoch = await rpc.getCurrentEpoch();
  return parseInt(currentEpoch.number, 16);
};

/**
 * A seeded random object, used in controling UI
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(min: number, max: number): number {
    // These numbers are constants used in the LCG algorithm.
    this.seed = (this.seed * 9301 + 49297) % 233280;
    const rnd = this.seed / 233280;
    return min + rnd * (max - min);
  }
}

/**
 * Verify if an address is joyID address or not
 */
export const isJoyIdAddress = (address: string) => {
  const config = getConfig();
  const script = addressToScript(address, { config });
  return (
    script.codeHash == JOYID_CELLDEP.codeHash
    && script.hashType == JOYID_CELLDEP.hashType
  );
};

/**
 * Verify if an address is an omnilock address or not
 */
export const isOmnilockAddress = (address: string) => {
  const config = getConfig();
  const script = addressToScript(address, { config });
  return (
    script.codeHash == OMNILOCK_CELLDEP.codeHash
    && script.hashType == OMNILOCK_CELLDEP.hashType
  );
};

/**
 * Verify if an address is secp256k1 address or not
 */
export const isDefaultAddress = (address: string) => {
  const config = getConfig();
  const script = addressToScript(address, { config });
  return (
    script.codeHash == NETWORK_CONFIG.SCRIPTS.SECP256K1_BLAKE160.CODE_HASH
    && script.hashType == NETWORK_CONFIG.SCRIPTS.SECP256K1_BLAKE160.HASH_TYPE
  );
};

/**
 * A workardound for joyID transaction fee since
 * joyID witness size varies + lumos doesn't support yet
 * 
 * @param transaction - The transaction skeleton.
 * @returns A regulated transaction.
 */
export const insertJoyIdWithnessPlaceHolder = (
  transaction: TransactionSkeletonType
) => {
  let inputIndex = 0;
  for (const input of transaction.inputs) {
    const keyPath = [ "witnesses", inputIndex];
    let witnessRaw = transaction.getIn(keyPath);

    const lockScriptWitness = (inputIndex == 0) ? JOYID_SIGNATURE_PLACEHOLDER_DEFAULT : "0x";
    if (witnessRaw === undefined) {
      witnessRaw = bytes.hexify(
        blockchain.WitnessArgs.pack({
          lock: lockScriptWitness,
        })
      );
      transaction = transaction.setIn(keyPath, witnessRaw);
    } else {
      const withnessArgs:WitnessArgs = blockchain.WitnessArgs.unpack(witnessRaw as BytesLike);
      withnessArgs.lock = lockScriptWitness;
      witnessRaw = bytes.hexify(blockchain.WitnessArgs.pack(withnessArgs));
      transaction = transaction.setIn(keyPath, witnessRaw);
    }
    inputIndex ++;
  }

  return transaction;
};

/**
 * Get transaction fee from a transaction
 * 
 * @param transaction - The transaction skeleton.
 * @param reward - Reward in case of a DAO unlock transaction.
 * @returns A regulated transaction.
 */
export const getFee = (
  transaction: TransactionSkeletonType,
  reward: bigint | null = null
):number => {
  const inputCapacity = transaction.inputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));

  const outputCapacity = transaction.outputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));

  // dao unlocking
  if (reward != null)
    return Number(inputCapacity + reward - outputCapacity);

  return Number(inputCapacity - outputCapacity);
};

/**
 * Decode dao data from block header dao
 */
function extractDaoDataCompatible(dao: PackedDao): {
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

/**
 * Estimate reward when withdraw transaction is requested
 * 
 * @param depositCell - The deposit cell being withdrawn.
 * @param tipEpoch - The CKB blockchain tip epoch
 * @returns Reward estimation.
 */
export const estimateReturn = async (depositCell:DaoCell, tipEpoch: number):Promise<number> => {
  const c_o = DAO_MINIMUM_CAPACITY;
  const c_t = parseInt(depositCell.cellOutput.capacity, 16)/CKB_SHANNON_RATIO;

  const [depositHeader, tipHeader] = await Promise.all([
    rpc.getHeader(depositCell.blockHash!),
    rpc.getTipHeader(),
  ]);

  const depositDaoData = extractDaoDataCompatible(depositHeader.dao);
  const tipDaoData = extractDaoDataCompatible(tipHeader.dao);
  const result = ( c_t - c_o ) * (BI.from(tipDaoData.ar).toNumber()) / (BI.from(depositDaoData.ar).toNumber()) + c_o;
  return result;
}
