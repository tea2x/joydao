import { CKBTransaction } from '@joyid/ckb';
import { CellDep, Address, Cell, Transaction} from "@ckb-lumos/base";
import { INDEXER_URL, TX_FEE, DAO_MINIMUM_CAPACITY, MINIMUM_CHANGE_CAPACITY, JOYID_CELLDEP} from "./const";
import { addressToScript, TransactionSkeleton, createTransactionFromSkeleton} from "@ckb-lumos/helpers";
import { dao }  from "@ckb-lumos/common-scripts";
import { Indexer } from "@ckb-lumos/ckb-indexer";
import { getBlockHash, ckbytesToShannons, intToHex, hexToInt, collectInputs } from './lib/helpers';
import { serializeWitnessArgs } from '@nervosnetwork/ckb-sdk-utils';

const INDEXER = new Indexer(INDEXER_URL);

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
  joyIDaddr: the joyID address
  amount: the amount to deposit to the DAO in CKB
  ----
  returns a CKB raw transaction
*/
export const buildDepositTransaction = async(joyidAddr: Address, amount: bigint): Promise<CKBTransaction> => {
    if (amount < DAO_MINIMUM_CAPACITY) {
        throw new Error("Mimum DAO deposit is 102 CKB.");
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
    let clonedInputCell:Cell = daoDepositCell;
    clonedInputCell.blockHash = await getBlockHash(daoDepositCell.blockNumber!);
    txSkeleton = txSkeleton.update("inputs", (i)=>i.push(clonedInputCell));

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
    for(let i = 1; i < (collectedInputs.inputCells.length + 1); i ++) {
        txSkeleton = txSkeleton.update("witnesses", (i)=>i.push("0x"));
    }

    // converting skeleton to CKB transaction
    const daoWithdrawTx: Transaction = createTransactionFromSkeleton(txSkeleton);
    return daoWithdrawTx as CKBTransaction;
}

// export const buildUnlockTransaction = async(joyidAddr: Address, daoDepositCell: Cell): Promise<CKBTransaction> => {
//     let txSkeleton = TransactionSkeleton({ cellProvider: INDEXER });

//     // adding joyID cell deps
//     txSkeleton = txSkeleton.update("cellDeps", (i)=>i.push(JOYID_CELLDEP as CellDep));
    
//     txSkeleton = await dao.unlock(txSkeleton, daoDepositCell, joyidAddr);

//     // converting skeleton to CKB transaction
//     const daoWithdrawTx: Transaction = createTransactionFromSkeleton(txSkeleton);
//     return daoWithdrawTx as CKBTransaction;
// }