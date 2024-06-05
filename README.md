# Abstract

To those who invest in CKB long term, wallet security is always the number 1 priority. Currently locking their CKB to the DAO with a hardware wallet seems best because it offers high security (but not Ledger). As we know CKB blockchain can support Passkeys SECP256r1 and [joyID has already leveraged that](https://discord.com/channels/1065112455170228314/1065116735797215332/1191939677440180335).

# Motivation
I want to offer an affordable and highly secure option for Nervos longterm investors to interact with the Nervos DAO without having to buy a hardware wallet. This project aims to enable Nervos DAO interaction via JoyID with Passkeys native level security.

# In case you want to verify joyDao's integrity
When we sign a transaction, we can check what it will trigger and whether it's malicious or not.

This can get complicated in Ethereum account model because a transaction can trigger a series of other transactions, and to verify the entire chain actions we have to check every single of them, we have to read smart contract source code that receives the triggered calls too.

With CKB eUTXO dubbed cell model, this is simple. Everything can be checked can verified in 1 single transaction that you're looking at joyID signing page because all it does in a transaction is 1) destroying cells in the inputs and 2) create new cells in the outputs.

Every cell(UTXO) has an ownership lock called Lock Script. Every cell also has another smart contract script called Type Script.

In this joyDAO application, all you need to verify is that the output cells - being created - has **your lock script** and the **Nervos DAO type script** on it (in deposit and withdrawal). And that's it. As long as that's ensured. Your funds will still be yours.

#### deposit

```json
{
    "version": "0x0",
    "cellDeps": ...,
    "headerDeps": ...,
    "inputs": ...,
    "outputs": [
        {
            "capacity": "0x7c0d5ad00",
            "lock": {
                "codeHash": "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac",
                "hashType": "type",
                "args": "0x00018d6961e236ec3f236b6239721015cd099dee27d7"
            },
            "type": {
                "codeHash": "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
                "hashType": "type",
                "args": "0x"
            }
        },
        {
            "capacity": "0x4fa0c8b5d5",
            "lock": {
                "codeHash": "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac",
                "hashType": "type",
                "args": "0x00018d6961e236ec3f236b6239721015cd099dee27d7"
            }
        }
    ],
    "outputsData": ...,
    "witnesses": ...
}
```

In the above joyDAO example transaction that you can see in joyID signing page, "lock" is short for Lock Script and "type" is short for Type Script. Take a look at the output cells. Here in this example we have 2 outputs.

- step1: go to : https://explorer.nervos.org/tools/address-conversion
- step2: in tab Address To Script, paste your joyId address and you'll see a data structure {codeHash, hashType, Args}
- step3: compare it to the trie in each output "lock". If matched, output cells are YOURS

You'll notice that the second cell doesn't have a Type Script, that is because it a change in a UTXO transaction and it doesn't belong to any "type" of smart contract.

#### withdraw

```json
{
    "version": ...,
    "cellDeps": ...,
    "inputs": ...,
    "outputs": [
        {
            "capacity": "0xcec0ecb00",
            "lock": {
                "codeHash": "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac",
                "hashType": "type",
                "args": "0x00018d6961e236ec3f236b6239721015cd099dee27d7"
            },
            "type": {
                "codeHash": "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
                "hashType": "type",
                "args": "0x"
            }
        },
        {
            "capacity": "0x57619e62d5",
            "lock": {
                "codeHash": "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac",
                "hashType": "type",
                "args": "0x00018d6961e236ec3f236b6239721015cd099dee27d7"
            }
        }
    ],
    "outputsData": ...,
    "witnesses": ...
}
```

The procedure to verify your ownership is similar to that of the deposit transaction.

#### unlock

```json
{
    "version": "0x0",
    "cellDeps": ...,
    "headerDeps": ...,
    "inputs": [
        {
            "since": "0x20070800f500231e",
            "previousOutput": {
                "txHash": "0xc25dbce7c11f68c060a5a25bef445d4cf97cf763a90502880b13ca2378ee7536",
                "index": "0x0"
            }
        }
    ],
    "outputs": [
        {
            "capacity": "0x26be340f0",
            "lock": {
                "codeHash": "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac",
                "hashType": "type",
                "args": "0x00018d6961e236ec3f236b6239721015cd099dee27d7"
            }
        }
    ],
    "outputsData": [
        "0x"
    ],
    "witnesses": [
        "0x1c00000010000000100000001c000000080000000000000000000000"
    ]
}
```

This is DAO unlocking transaction. It doesn't have any typescript because you're opting out of the Nervos DAO to get your CKB back. And the procedure to verify your ownership is similar to that of the deposit transaction.

# Starting project

    `npm start`
