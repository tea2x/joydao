import { CKBTransaction } from '@joyid/ckb';
import { utils, CellDep, Script, Address, Cell, Transaction} from "@ckb-lumos/base";
import { NODE_URL, INDEXER_URL, TX_FEE, DAO_MINIMUM_CAPACITY, MINIMUM_CHANGE_CAPACITY, JOYID_CELLDEP} from "./const";
import { addressToScript, encodeToAddress, TransactionSkeleton, createTransactionFromSkeleton} from "@ckb-lumos/helpers";
import { CKBIndexerQueryOptions } from '@ckb-lumos/ckb-indexer/src/type';
import { dao }  from "@ckb-lumos/common-scripts";
import { TerminableCellFetcher } from '@ckb-lumos/ckb-indexer/src/type';
import { Indexer, CellCollector} from "@ckb-lumos/ckb-indexer";
const { RPC } = require('@ckb-lumos/rpc');
import { serializeWitnessArgs } from '@nervosnetwork/ckb-sdk-utils';

const { ckbHash } = utils;

const INDEXER = new Indexer(INDEXER_URL);

async function getBlockHash(blockNumber: string) {
    const rpc = new RPC(NODE_URL);
    const blockHash = await rpc.getBlockHash(blockNumber);
    return blockHash;
  }

function ckbytesToShannons(ckbytes: bigint) {
	ckbytes = BigInt(ckbytes);

	return ckbytes * BigInt(100_000_000);
}

function intToHex(intValue: bigint): string {
    if (typeof intValue !== 'bigint') {
        throw new Error('Input value must be a BigInt');
    }

    let hexString = (intValue >= 0 ? '' : '-') + intValue.toString(16);

    if (intValue < 0) {
        console.warn('Warning: A negative value was passed to intToHex()');
    }

    return "0x" + hexString;
}

function hexToInt(hex: string) {
	hex = String(hex);
	if(hex.substr(0, 2) !== "0x" && hex.substr(0,3) !== "-0x")
		throw new Error(`Invalid hex value: "${hex}"`);

	const negative = (hex[0] === "-");
	const hexValue = hex.replace("-", "");
	let bigInt = BigInt(hexValue);
	if(negative) bigInt *= BigInt(-1);

	if(negative)
		console.warn("Warning: A negative value was passed to hexToInt()");

	return bigInt;
}

const collectInputs = async(
    indexer: TerminableCellFetcher, 
    lockScript: Script, 
    capacityRequired: bigint
): Promise<{ inputCells: Cell[], inputCapacity: bigint }> => {
	const query:CKBIndexerQueryOptions = {lock: lockScript, type: "empty"};
	const cellCollector = new CellCollector(indexer, query);

	let inputCells:Cell[] = [];
	let inputCapacity = BigInt(0);

	for await (const cell of cellCollector.collect())
	{
		inputCells.push(cell);
		inputCapacity += hexToInt(cell.cellOutput.capacity);

		if(inputCapacity >= capacityRequired)
			break;
	}

	if(inputCapacity < capacityRequired)
		throw new Error("Insufficient balance.");

	return {inputCells, inputCapacity};
}

export const queryBalance = async(joyidAddr: Address): Promise<bigint> => {
    const query:CKBIndexerQueryOptions = {lock: addressToScript(joyidAddr), type: "empty"};
	const cellCollector = new CellCollector(INDEXER, query);

	let balance = BigInt(0);

	for await (const cell of cellCollector.collect()) {
		balance += hexToInt(cell.cellOutput.capacity);
	}

	return balance/BigInt(100_000_000);
}

/*
  joyIDaddr: the joyID address
  amount: the amount to deposit to the DAO in CKB
*/
export const buildDepositTransaction = async(joyidAddr: Address, amount: bigint): Promise<CKBTransaction> => {
    if (amount < DAO_MINIMUM_CAPACITY) {
        throw new Error("Mimum DAO deposit is 102 CKB.");
    }

    // generating basic dao transaction skeleton
    // TODO move to the end and test
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

    // TODO this is following Omiga footstep. Check case there're more than 2 inputs
    // add joyID witnesses
    const emptyWitness = { lock: '', inputType: '', outputType: '' };
    txSkeleton = txSkeleton.update("witnesses", (i)=>i.push(serializeWitnessArgs(emptyWitness)));
    txSkeleton = txSkeleton.update("witnesses", (i)=>i.push("0x"));

    // converting skeleton to CKB transaction
    const daoDepositTx: Transaction = createTransactionFromSkeleton(txSkeleton);

    return daoDepositTx as CKBTransaction;
}

export const collectDeposits = async(joyidAddr: Address): Promise<Cell[]> => {
    let depositCells:Cell[] = [];
    const daoDepositedCellCollector = new dao.CellCollector( joyidAddr, INDEXER, "deposit");
    for await (const inputCell of daoDepositedCellCollector.collect()) {
        depositCells.push(inputCell);
    }
    return depositCells;
}

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

    // TODO this is following Omiga footstep. Check case there're more than 2 inputs
    // add joyID witnesses
    const emptyWitness = { lock: '', inputType: '', outputType: '' };
    txSkeleton = txSkeleton.update("witnesses", (i)=>i.push(serializeWitnessArgs(emptyWitness)));
    txSkeleton = txSkeleton.update("witnesses", (i)=>i.push("0x"));

    // converting skeleton to CKB transaction
    const daoWithdrawTx: Transaction = createTransactionFromSkeleton(txSkeleton);
    console.log(">>>daoWithdrawTx: ", JSON.stringify(daoWithdrawTx))
    return daoWithdrawTx as CKBTransaction;
}