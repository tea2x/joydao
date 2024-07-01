import { RPC } from "@ckb-lumos/lumos";
import {
  Script,
  Address,
  Cell,
  Transaction,
  since,
  utils,
  blockchain,
  PackedDao,
} from "@ckb-lumos/base";
const { computeScriptHash } = utils;
const { parseSince } = since;
import {
  NODE_URL,
  INDEXER_URL,
  CKB_SHANNON_RATIO,
  JOYID_CELLDEP,
  OMNILOCK_CELLDEP,
  JOYID_SIGNATURE_PLACEHOLDER_DEFAULT,
  OMNILOCK_SIGNATURE_PLACEHOLDER_DEFAULT,
  DAO_MINIMUM_CAPACITY,
  ISMAINNET,
  COTA_AGGREGATOR_URL,
  NETWORK_CONFIG,
} from "../config";
import { addressToScript, TransactionSkeletonType } from "@ckb-lumos/helpers";
import { CKBIndexerQueryOptions } from "@ckb-lumos/ckb-indexer/src/type";
import { TerminableCellFetcher } from "@ckb-lumos/ckb-indexer/src/type";
import { CellCollector, Indexer } from "@ckb-lumos/ckb-indexer";
import { LightClientRPC } from "@ckb-lumos/light-client";
import { getConfig } from "@ckb-lumos/config-manager";
import { dao } from "@ckb-lumos/common-scripts";
import { EpochSinceValue } from "@ckb-lumos/base/lib/since";
import { BI, BIish } from "@ckb-lumos/bi";
import { bytes, number } from "@ckb-lumos/codec";
import { getSubkeyUnlock, getCotaTypeScript } from '@joyid/ckb'

const INDEXER = new Indexer(INDEXER_URL);
const rpc = new RPC(NODE_URL);
const lightClientRPC = new LightClientRPC(NODE_URL);

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

export async function getBlockHash(blockNumber: string) {
  const blockHash = await rpc.getBlockHash(blockNumber);
  return blockHash;
}

export function ckbytesToShannons(ckbytes: bigint) {
  ckbytes = BigInt(ckbytes);

  return ckbytes * BigInt(CKB_SHANNON_RATIO);
}

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

export const collectInputs = async (
  indexer: TerminableCellFetcher,
  lockScript: Script,
  capacityRequired: bigint
): Promise<{ inputCells: Cell[]; inputCapacity: bigint }> => {
  const query: CKBIndexerQueryOptions = { lock: lockScript, type: "empty" };
  const cellCollector = new CellCollector(indexer, query);

  let inputCells: Cell[] = [];
  let inputCapacity = BigInt(0);

  for await (const cell of cellCollector.collect()) {
    inputCells.push(cell);
    inputCapacity += hexToInt(cell.cellOutput.capacity);

    if (inputCapacity >= capacityRequired) break;
  }

  if (inputCapacity < capacityRequired)
    throw new Error(
      "Insufficient balance. If you intend to have some CKB remained, be sure it's greater than 63!"
    );

  return { inputCells, inputCapacity };
};

export interface Balance {
  available: string;
  occupied: string;
}
export const queryBalance = async (joyidAddr: Address): Promise<Balance> => {
  const ret: Balance = { available: "", occupied: "" };

  // query available balance
  let query: CKBIndexerQueryOptions = {
    lock: addressToScript(joyidAddr),
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
    lock: addressToScript(joyidAddr),
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

export async function sendTransaction(signedTx: Transaction) {
  let result;
  try {
    result = await rpc.sendTransaction(signedTx);
  } catch (error: any) {
    const regex = /^(\w+): ([\w\s]+) (\{.*\})$/;
    const matches = error.message.match(regex);

    if (!!matches && matches.length > 0) {
      const category = matches[1];
      const type = matches[2];
      const json = JSON.parse(matches[3]);

      console.log();
      console.error(`Error: ${category}`);
      console.error(`Type: ${type}`);
      console.error(`Code: ${json.code}`);
      console.error(`Message: ${json.message}`);
      console.error(`Data: ${json.data}`);
      console.log();

      throw new Error("RPC Returned Error!");
    } else throw error;
  }

  return result;
}

export async function waitForConfirmation(
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

export async function waitForTransactionConfirmation(txid: string) {
  console.log("Waiting for transaction to confirm.");
  await waitForConfirmation(txid, (_status) => console.log("."), {
    recheckMs: 3_000,
  });
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

export const enrichDaoCellInfo = async (
  cell: DaoCell,
  deposit: boolean,
  tipEpoch: number
) => {
  if (cell.isDeposit == null) {
    cell.isDeposit = deposit;
    cell.blockHash = await getBlockHash(cell.blockNumber!);

    let depositBlockHeader;
    if (deposit) {
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
    if (deposit == false && cell.ripe) {
      // when unlocking period arrives, current cycle halt at 100%
      cell.currentCycleProgress = 100;
    } else {
      cell.currentCycleProgress = Math.floor(((step % 180) * 100) / 180);
    }
    cell.cycleEndInterval = 180 - (step % 180);
  }
};

export const getTipEpoch = async (): Promise<number> => {
  const currentEpoch = await rpc.getCurrentEpoch();
  return parseInt(currentEpoch.number, 16);
};

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

export const isJoyIdAddress = (address: string) => {
  const config = getConfig();
  const script = addressToScript(address, { config });
  return (
    script.codeHash == JOYID_CELLDEP.codeHash
    && script.hashType == JOYID_CELLDEP.hashType
  );
};

export const isOmnilockAddress = (address: string) => {
  const config = getConfig();
  const script = addressToScript(address, { config });
  return (
    script.codeHash == OMNILOCK_CELLDEP.codeHash
    && script.hashType == OMNILOCK_CELLDEP.hashType
  );
};

export const isDefaultAddress = (address: string) => {
  const config = getConfig();
  const script = addressToScript(address, { config });
  return (
    script.codeHash == NETWORK_CONFIG.SCRIPTS.SECP256K1_BLAKE160.CODE_HASH
    && script.hashType == NETWORK_CONFIG.SCRIPTS.SECP256K1_BLAKE160.HASH_TYPE
  );
};

// append subkey device celldep if it is
export const appendSubkeyDeviceCellDep = async (
  transaction: TransactionSkeletonType,
  joyIdAuth:any
) => {
  // append CoTa celldep for sub-key device
  if (joyIdAuth && joyIdAuth.keyType === 'sub_key') {
    // Get CoTA cell from CKB blockchain and append it to the head of the cellDeps list
    const cotaType = getCotaTypeScript(ISMAINNET)
    const cotaCellsCollector = new CellCollector(INDEXER, { lock: addressToScript(joyIdAuth.address), type: cotaType });
    let cotaCells:Cell[] = [];
    for await (const cell of cotaCellsCollector.collect()) {
      cotaCells.push(cell);
    }
    if (!cotaCells || cotaCells.length === 0) {
      throw new Error("Cota cell doesn't exist");
    }
    const cotaCell = cotaCells[0];

    transaction = transaction.update("cellDeps", (i) =>
      i.push({
        outPoint: cotaCell.outPoint!,
        depType: "code",
      })
    );
  }
  return transaction;
}

// this function is only for joyID lock and omnilock
export const addWitnessPlaceHolder = async (
  transaction: TransactionSkeletonType,
  joyIdAuth:any,
  daoUnlock = false,
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
    let inputTypeScriptWitness;
    let outputTypeScriptWitness;

    const lockHash = computeScriptHash(input.cellOutput.lock);
    if (!uniqueLocks.has(lockHash)) {
      uniqueLocks.add(lockHash);

      if (
        input.cellOutput.lock.hashType === "type" &&
        input.cellOutput.lock.codeHash === JOYID_CELLDEP.codeHash
      ) {
        lockScriptWitness = JOYID_SIGNATURE_PLACEHOLDER_DEFAULT;
      } else if (
        input.cellOutput.lock.hashType === "type" &&
        input.cellOutput.lock.codeHash === OMNILOCK_CELLDEP.codeHash
      ) {
        lockScriptWitness = OMNILOCK_SIGNATURE_PLACEHOLDER_DEFAULT;
      }

      // will fall on the the first input - deposit cell
      if (daoUnlock) {
        inputTypeScriptWitness = "0x0000000000000000";
      }

      // for subkey device
      if (joyIdAuth && joyIdAuth.keyType === 'sub_key') {
        let unlockEntry = await getSubkeyUnlock(COTA_AGGREGATOR_URL, joyIdAuth);
        unlockEntry = unlockEntry.startsWith('0x') ? unlockEntry : `0x${unlockEntry}`
        outputTypeScriptWitness = unlockEntry;
      }

      witness = bytes.hexify(
        blockchain.WitnessArgs.pack({
          lock: lockScriptWitness,
          inputType: inputTypeScriptWitness,
          outputType: outputTypeScriptWitness
        })
      );
    }
    transaction = transaction.update("witnesses", (w) => w.push(witness));
  }

  return transaction;
};

// this is estimating, use number instead of BigInt
export const getFee = (transaction: TransactionSkeletonType):number => {
  const inputCapacity = transaction.inputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));

  const outputCapacity = transaction.outputs
    .toArray()
    .reduce((a, c) => a + hexToInt(c.cellOutput.capacity), BigInt(0));

  return Number(inputCapacity - outputCapacity);
};

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

export default {
  sendTransaction,
  waitForTransactionConfirmation,
  getBlockHash,
  ckbytesToShannons,
  intToHex,
  hexToInt,
  collectInputs,
  queryBalance,
  findDepositCellWith,
};
