declare type HashType = "type" | "data" | "data1" | "data2";
declare type DepType = "depGroup" | "code";
declare type HexString = string;
declare type Hexadecimal = string;
declare type HexNumber = Hexadecimal;
declare type Hash = HexString;
declare type PackedSince = string;

export interface CkbTransactionRequest {
    from: string
    to: string
    amount: string
}

/** Deployed script on chain */
export interface ScriptConfig {
    CODE_HASH: string;
    HASH_TYPE: HashType;
    TX_HASH: string;
    INDEX: string;
    DEP_TYPE: "depGroup" | "code";
    /**
     * @deprecated the short address will be removed in the future
     * Short ID for creating CKB address, not all scripts have short IDs.
     */
    SHORT_ID?: number;
}

export interface ScriptConfigs {
    [field: string]: ScriptConfig | undefined;
}

export interface Config {
    PREFIX: string;
    SCRIPTS: ScriptConfigs;
}

export interface OutPoint {
    txHash: Hash;
    index: HexNumber;
}
export interface CellDep {
    outPoint: OutPoint;
    depType: DepType;
}
export interface Input {
    previousOutput: OutPoint;
    since: PackedSince;
}

export interface Script {
    codeHash: Hash;
    hashType: HashType;
    args: HexString;
}

export interface Output {
    capacity: HexString;
    lock: Script;
    type?: Script;
}

export interface Transaction {
    cellDeps: CellDep[];
    hash?: Hash;
    headerDeps: Hash[];
    inputs: Input[];
    outputs: Output[];
    outputsData: HexString[];
    version: HexNumber;
    witnesses: HexString[];
}
