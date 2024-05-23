export const NODE_URL = "https://testnet.ckb.dev/";
export const INDEXER_URL = "https://testnet.ckb.dev/indexer";

export const DAO_TYPE_SCRIPT = {
    codeHash: "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
    hashType: "type",
    args: "0x"
};

export const JOY_DAO_CELLDEPS = [
    {
      outPoint: {
        txHash: "0xbe65905ae38972e943874ef67f9d8ff1966dca37959a94be36dc37104ebf0f49",
        index: "0x0"
      },
      depType: "depGroup"
    },
    {
      outPoint: {
        txHash: "0x8f8c79eb6671709633fe6a46de93c0fedc9c1b8a6527a18d3983879542635c9f",
        index: "0x2"
      },
      depType: "depGroup"
    }
];

export const TX_FEE = 10000; //shanon
export const DAO_MINIMUM_CAPACITY = 102; //102ckb
export const MINIMUM_CHANGE_CAPACITY = 61; //61ckb