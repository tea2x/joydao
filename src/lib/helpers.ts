import { RPC } from "@ckb-lumos/lumos";
import { Script, Address, Cell, Transaction, OutPoint} from "@ckb-lumos/base";
import { NODE_URL, INDEXER_URL, CKB_SHANNON_RATIO } from "../config";
import { addressToScript } from "@ckb-lumos/helpers";
import { CKBIndexerQueryOptions } from '@ckb-lumos/ckb-indexer/src/type';
import { TerminableCellFetcher } from '@ckb-lumos/ckb-indexer/src/type';
import { CellCollector, Indexer} from "@ckb-lumos/ckb-indexer";
import { LightClientRPC } from "@ckb-lumos/light-client";
import { getConfig } from "@ckb-lumos/config-manager";

const INDEXER = new Indexer(INDEXER_URL);
const rpc = new RPC(NODE_URL);
const lightClientRPC = new LightClientRPC(NODE_URL);

export async function getBlockHash(blockNumber: string) {
    const blockHash = await rpc.getBlockHash(blockNumber);
    return blockHash;
}

export function ckbytesToShannons(ckbytes: bigint) {
	ckbytes = BigInt(ckbytes);

	return ckbytes * BigInt(CKB_SHANNON_RATIO);
}

export function intToHex(intValue: bigint): string {
    if (typeof intValue !== 'bigint') {
        throw new Error('Input value must be a BigInt');
    }

    let hexString = (intValue >= 0 ? '' : '-') + intValue.toString(16);

    if (intValue < 0) {
        console.warn('Warning: A negative value was passed to intToHex()');
    }

    return "0x" + hexString;
}

export function hexToInt(hex: string) {
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

export const collectInputs = async(
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

export interface Balance {
	available: string,
	occupied: string
}
export const queryBalance = async(joyidAddr: Address): Promise<Balance> => {
	const ret:Balance = {available: "", occupied: ""};

	// query available balance
    let query:CKBIndexerQueryOptions = {lock: addressToScript(joyidAddr), type: "empty"};
	const cellCollector = new CellCollector(INDEXER, query);
	let balance = BigInt(0);
	for await (const cell of cellCollector.collect()) {
		balance += hexToInt(cell.cellOutput.capacity);
	}
	ret.available = (balance/BigInt(CKB_SHANNON_RATIO)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

	// query dao capacity locked in
	const config = getConfig();
	const DAO_SCRIPT = config.SCRIPTS.DAO;
	if (!DAO_SCRIPT) {
		throw new Error("Provided config does not have DAO script setup!");
	}
	const daoQuery:CKBIndexerQueryOptions = {
		lock: addressToScript(joyidAddr),
		type: {
			codeHash: DAO_SCRIPT.CODE_HASH,
			hashType: DAO_SCRIPT.HASH_TYPE,
			args: "0x",
	  	}
	};

	const daoCellCollector = new CellCollector(INDEXER, daoQuery);

	balance = BigInt(0);
	for await (const cell of daoCellCollector.collect()) {
		balance += hexToInt(cell.cellOutput.capacity);
	}
	ret.occupied = (balance/BigInt(CKB_SHANNON_RATIO)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

	return ret;
}

export interface FindDepositCellResult {
    deposit: Cell;
    depositTrace: OutPoint;
}
export const findDepositCellWith = async(withdrawalCell: Cell): Promise<FindDepositCellResult> => {
    const withdrawPhase1TxRecord:any = await rpc.getTransaction(withdrawalCell.outPoint!.txHash);
	const depositCellTrace = withdrawPhase1TxRecord.transaction.inputs[parseInt(withdrawalCell.outPoint!.index, 16)];

	const depositTxRecord:any = await rpc.getTransaction(depositCellTrace.previousOutput.txHash);
	const depositCellOutput:any = depositTxRecord.transaction.outputs[parseInt(depositCellTrace.previousOutput.index, 16)];

	let retCell:Cell = {
		cellOutput: {
			capacity: depositCellOutput.capacity,
			lock: depositCellOutput.lock,
			type: depositCellOutput.type
		},
		data: depositTxRecord.transaction.outputsData[parseInt(depositCellTrace.previousOutput.index, 16)],
		blockHash: depositTxRecord.txStatus.blockHash
	};

	return {
		deposit: retCell,
		depositTrace: depositCellTrace.previousOutput
	};
}

export async function sendTransaction(signedTx: Transaction) {
	let result;
	try
	{
		result = await rpc.sendTransaction(signedTx);
	}
	catch(error:any)
	{
		const regex = /^(\w+): ([\w\s]+) (\{.*\})$/;
		const matches = error.message.match(regex);

		if(!!matches && matches.length > 0)
		{
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
		}
		else
			throw error;
	}
	
	return result;
}

export async function waitForConfirmation(txid: string, updateProgress=((_status:any)=>{}), options:any) {
	const defaults = {timeoutMs: 300_000, recheckMs: 250, throwOnNotFound: true};
	options = {...defaults, ...options};

	return new Promise<void>(async (resolve, reject) =>
	{
		let timedOut = false;
		const timeoutTimer = (options.timeoutMs !== 0) ? setTimeout(()=>{timedOut = true;}, options.timeoutMs) : false;

		while(true)
		{
			if(timedOut)
				return reject(Error("Transaction timeout."));

			const transaction = await rpc.getTransaction(txid);

			if(!!transaction)
			{
				const status = transaction.txStatus.status;

				updateProgress(status);

				if(status === "committed")
				{
					if(timeoutTimer)
						clearTimeout(timeoutTimer);

					break;
				}
			}
			else if(transaction === null)
			{
				if(options.throwOnNotFound)
					return reject(Error("Transaction was not found."));
				else
					updateProgress("not_found");
			}
			
			await new Promise(resolve=>setTimeout(resolve, options.recheckMs));
		}

		return resolve();
	});
}

export async function waitForTransactionConfirmation(txid: string)
{
	console.log("Waiting for transaction to confirm.");
	await waitForConfirmation(txid, (_status)=>console.log("."), {recheckMs: 1_000});
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
	findDepositCellWith
};
