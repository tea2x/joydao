import { CKBTransaction } from '@joyid/ckb';
import { CellDep, Address, Cell, Transaction, HexString, PackedDao, PackedSince, since } from "@ckb-lumos/base";
const { parseSince } = since;
import { EpochSinceValue } from "@ckb-lumos/base/lib/since"
import { INDEXER_URL, NODE_URL, TX_FEE, DAO_MINIMUM_CAPACITY, MINIMUM_CHANGE_CAPACITY, JOYID_CELLDEP} from "./config";
import { addressToScript, TransactionSkeleton, createTransactionFromSkeleton, minimalCellCapacityCompatible} from "@ckb-lumos/helpers";
import { dao }  from "@ckb-lumos/common-scripts";
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { getBlockHash, ckbytesToShannons, intToHex, hexToInt, collectInputs, findDepositCellWith, FindDepositCellResult } from './lib/helpers';
import { serializeWitnessArgs } from '@nervosnetwork/ckb-sdk-utils';
import { number } from "@ckb-lumos/codec";
import { getConfig, Config } from "@ckb-lumos/config-manager";
import { BI, BIish } from "@ckb-lumos/bi";
import { RPC } from "@ckb-lumos/rpc";

const DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE = BI.from(180);
const rpc = new RPC(NODE_URL);
const INDEXER = new Indexer(INDEXER_URL);

//TODO support Lumos-common script in covering joyId lockscript

/*
  joyIDaddr: the joyID address
  ----
  returns an array of Cells
*/
export const collectDeposits = async(joyidAddr: Address): Promise<Cell[]> => {
    let depositCells:Cell[] = [];
    const daoDepositedCellCollector = new dao.CellCollector( joyidAddr, INDEXER, "deposit");
    for await (const inputCell of daoDepositedCellCollector.collect()) {
        depositCells.push(inputCell);
    }
    return depositCells;
}

/*
  joyIDaddr: the joyID address
  ----
  returns an array of Cells
*/
export const collectWithdrawals = async(joyidAddr: Address): Promise<Cell[]> => {
    let depositCells:Cell[] = [];
    const daoDepositedCellCollector = new dao.CellCollector( joyidAddr, INDEXER, "withdraw");
    for await (const inputCell of daoDepositedCellCollector.collect()) {
        depositCells.push(inputCell);
    }
    return depositCells;
}

/*
  Buid DAO deposit raw transaction
  ----
  joyIDaddr: the joyID address
  amount: the amount to deposit to the DAO in CKB
  ----
  returns a CKB raw transaction
*/
export const buildDepositTransaction = async(joyidAddr: Address, amount: bigint): Promise<CKBTransaction> => {
    if (amount < DAO_MINIMUM_CAPACITY) {
        throw new Error("Mimum DAO deposit is 104 CKB.");
    }

    // generating basic dao transaction skeleton
    let txSkeleton = TransactionSkeleton({ cellProvider: INDEXER });
    txSkeleton = await dao.deposit(
        txSkeleton,
        joyidAddr, // will gather inputs from this address.
        joyidAddr, // will generate a dao cell with lock of this address.
        ckbytesToShannons(amount),
    );

    // adding joyID cell deps
    txSkeleton = txSkeleton.update("cellDeps", (i)=>i.push(JOYID_CELLDEP as CellDep));

    // adding input capacity cells
    const requiredCapacity = ckbytesToShannons(amount + BigInt(MINIMUM_CHANGE_CAPACITY)) + BigInt(TX_FEE);
    const collectedInputs = await collectInputs(INDEXER, addressToScript(joyidAddr), requiredCapacity);
    txSkeleton = txSkeleton.update("inputs", (i)=>i.concat(collectedInputs.inputCells));

    // calculate change and add an output cell
    const outputCapacity = txSkeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), BigInt(0));
    const changeCellCapacity = collectedInputs.inputCapacity - outputCapacity - BigInt(TX_FEE);
    let change:Cell = {cellOutput: {capacity: intToHex(changeCellCapacity), lock: addressToScript(joyidAddr)}, data: "0x"};
	txSkeleton = txSkeleton.update("outputs", (i)=>i.push(change));

    // add joyID witnesses
    const emptyWitness = { lock: '', inputType: '', outputType: '' };
    txSkeleton = txSkeleton.update("witnesses", (i)=>i.push(serializeWitnessArgs(emptyWitness)));
    for(let i = 1; i < collectedInputs.inputCells.length; i ++) {
        txSkeleton = txSkeleton.update("witnesses", (i)=>i.push("0x"));
    }
    
    // converting skeleton to CKB transaction
    const daoDepositTx: Transaction = createTransactionFromSkeleton(txSkeleton);

    return daoDepositTx as CKBTransaction;
}

/*
  Buid DAO withdraw raw transaction
  ----
  joyIDaddr: the joyID address
  daoDepositCell: the cell that locks the DAO deposit
  ----
  returns a CKB raw transaction
*/
export const buildWithdrawTransaction = async(joyidAddr: Address, daoDepositCell: Cell): Promise<CKBTransaction> => {
    let txSkeleton = TransactionSkeleton({ cellProvider: INDEXER });

    // adding joyID cell deps
    txSkeleton = txSkeleton.update("cellDeps", (i)=>i.push(JOYID_CELLDEP as CellDep));

    // add dao input cell
    txSkeleton = txSkeleton.update("inputs", (i)=>i.push(daoDepositCell));

    // add dao output cell
    const daoOutputCell:Cell = {
        cellOutput: {
            capacity: daoDepositCell.cellOutput.capacity, 
            lock: daoDepositCell.cellOutput.lock, 
            type: daoDepositCell.cellOutput.type
        }, 
        data: "0x", // dao.withdraw will fill in
    };
    txSkeleton = txSkeleton.update("outputs", (i)=>i.push(daoOutputCell));

    // generate the dao withdraw skeleton
    txSkeleton = await dao.withdraw(txSkeleton, daoDepositCell, joyidAddr);

    // add fee cell and minimal change cell. Change cell is calculated in advance because
    // if we tend to have a change cell, its capacity must be greater than 61ckb
    const requiredCapacity = ckbytesToShannons(BigInt(MINIMUM_CHANGE_CAPACITY)) + BigInt(TX_FEE);
    const collectedInputs = await collectInputs(INDEXER, addressToScript(joyidAddr), requiredCapacity);
    txSkeleton = txSkeleton.update("inputs", (i)=>i.concat(collectedInputs.inputCells));

    // calculate change and add an output cell
    const inputCapacity = txSkeleton.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), BigInt(0));
    const outputCapacity = hexToInt(daoOutputCell.cellOutput.capacity);
    const changeCellCapacity = inputCapacity - outputCapacity - BigInt(TX_FEE);
    let change:Cell = {cellOutput: {capacity: intToHex(changeCellCapacity), lock: addressToScript(joyidAddr)}, data: "0x"};
	txSkeleton = txSkeleton.update("outputs", (i)=>i.push(change));

    // add joyID witnesses
    const emptyWitness = { lock: '', inputType: '', outputType: '' };
    txSkeleton = txSkeleton.update("witnesses", (i)=>i.push(serializeWitnessArgs(emptyWitness)));
    for(let i = 1; i < txSkeleton.inputs.toArray().length; i ++) {
        txSkeleton = txSkeleton.update("witnesses", (i)=>i.push("0x"));
    }

    // converting skeleton to CKB transaction
    const daoWithdrawTx: Transaction = createTransactionFromSkeleton(txSkeleton);
    return daoWithdrawTx as CKBTransaction;
}

/*
  Buid DAO unlock raw transaction
  ----
  joyIDaddr: the joyID address
  daoDepositCell: the cell that locks the DAO deposit
  daoWithdrawalCell: the DAO withdrawal cell
  ----
  returns a CKB raw transaction
*/
export const buildUnlockTransaction = async(joyidAddr: Address, daoWithdrawalCell: Cell): Promise<CKBTransaction> => {
    const config = getConfig();
    _checkDaoScript(config);

    let txSkeleton = TransactionSkeleton({ cellProvider: INDEXER });

    //  adding DAO celldeps and joyID celldeps
    const template = config.SCRIPTS.DAO!;
    const daoCellDep = {
        outPoint: {
        txHash: template.TX_HASH,
        index: template.INDEX,
        },
        depType: template.DEP_TYPE,
    }
    txSkeleton = txSkeleton.update("cellDeps", (i)=>i.push(daoCellDep as CellDep));
    txSkeleton = txSkeleton.update("cellDeps", (i)=>i.push(JOYID_CELLDEP as CellDep));

    // find the deposit cell
    const ret:FindDepositCellResult = await findDepositCellWith(daoWithdrawalCell);
    let daoDepositCell = ret.deposit;
    daoDepositCell.outPoint = ret.depositTrace;

    // enrich DAO withdrawal cell data with block hash info
    daoWithdrawalCell.blockHash = await getBlockHash(daoWithdrawalCell.blockNumber!);

    // calculate since & capacity (interest)
    const depositBlockHeader = await rpc.getHeader(daoDepositCell.blockHash!);
    const depositEpoch = parseEpochCompatible(depositBlockHeader!.epoch);
  
    const withdrawBlockHeader = await rpc.getHeader(daoWithdrawalCell.blockHash!);
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
  
    const outputCapacity: HexString =
      "0x" +
      calculateMaximumWithdrawCompatible(
        daoWithdrawalCell,
        depositBlockHeader!.dao,
        withdrawBlockHeader!.dao
      ).toString(16);
  
    txSkeleton = txSkeleton.update("outputs", (outputs) => {
      return outputs.push({
        cellOutput: {
          capacity: intToHex(BigInt(parseInt(outputCapacity,16) - TX_FEE)),
          lock: addressToScript(joyidAddr),
          type: undefined,
        },
        data: "0x",
        outPoint: undefined,
        blockHash: undefined,
      });
    });
  
    const since: PackedSince = "0x" + minimalSince.toString(16);

    // add header deps
    txSkeleton = txSkeleton.update("headerDeps", (headerDeps) => {
        return headerDeps.push(daoDepositCell.blockHash!, daoWithdrawalCell.blockHash!);
    });

    // adding dao withdrawal cell as input
    txSkeleton = txSkeleton.update("inputs", (i)=>i.push(daoWithdrawalCell));
    if (since) {
        txSkeleton = txSkeleton.update("inputSinces", (inputSinces) => {
          return inputSinces.set(txSkeleton.get("inputs").size - 1, since);
        });
    }

    // add joyID witnesses place holder; inputType is 64-bit unsigned little-endian integer format 
    // of the deposit cell header index in header_deps, which is 0x0000000000000000 for index 0
    const emptyWitness = { lock: '', inputType: '0x0000000000000000', outputType: '' };
    txSkeleton = txSkeleton.update("witnesses", (i)=>i.push(serializeWitnessArgs(emptyWitness)));
    for(let i = 1; i < txSkeleton.inputs.toArray().length; i ++) {
        txSkeleton = txSkeleton.update("witnesses", (i)=>i.push("0x"));
    }

    // fix inputs / outputs / witnesses
    txSkeleton = txSkeleton.update("fixedEntries", (fixedEntries) => {
        return fixedEntries.push(
            {
            field: "inputs",
            index: txSkeleton.get("inputs").size - 1,
            },
            {
            field: "outputs",
            index: txSkeleton.get("outputs").size - 1,
            },
            {
            field: "witnesses",
            index: txSkeleton.get("witnesses").size - 1,
            },
            {
            field: "headerDeps",
            index: txSkeleton.get("headerDeps").size - 2,
            }
        );
    });

    // converting skeleton to CKB transaction
    const daoWithdrawTx: Transaction = createTransactionFromSkeleton(txSkeleton);
    return daoWithdrawTx as CKBTransaction;
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

export function calculateMaximumWithdrawCompatible(
    withdrawCell: Cell,
    depositDao: PackedDao,
    withdrawDao: PackedDao
): BI {
    const depositAR = BI.from(extractDaoDataCompatible(depositDao).ar);
    const withdrawAR = BI.from(extractDaoDataCompatible(withdrawDao).ar);
  
    const occupiedCapacity = BI.from(minimalCellCapacityCompatible(withdrawCell));
    const outputCapacity = BI.from(withdrawCell.cellOutput.capacity);
    const countedCapacity = outputCapacity.sub(occupiedCapacity);
    const withdrawCountedCapacity = countedCapacity
      .mul(withdrawAR)
      .div(depositAR);
  
    return withdrawCountedCapacity.add(occupiedCapacity);
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