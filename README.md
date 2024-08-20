# Abstract

Nervos DAO users have several options to protect their investments from CKB inflation through various software, hardware, and passkey wallets.

Neuron is the first-generation wallet on CKB and is considered the safest software wallet. However, it is a full-node wallet, making it quite heavy. PW Wallet offers MetaMask compatibility but is no longer maintained. JoyID passkey wallet stands out for its well-balanced features, making it a potential standard for protecting CKB for decades to come, although it currently does not support Nervos DAO users.

Thanks to the incredible support from the CKB community, especially the Common Chain Connector (CCC), a special software enabling ‘wallet abstraction’ on CKB, we can now envision a universal wallet-interfaced application. This application will cater to users from MetaMask, Brave, OKX, Unisat, Fantom wallets, and even passkey wallets like JoyID. My goal is to build a convenient, versatile user interface and a secure option for CKB users to utilize Nervos DAO.

To those who are not familiar with Nervos DAO, check https://medium.com/nervosnetwork/understanding-the-nervos-dao-and-cell-model-d68f38272c24

# Demo
https://joydao.vercel.app/

<img width="770" alt="Screenshot 2024-08-11 at 13 26 49" src="https://github.com/user-attachments/assets/4cc31bd5-dd65-49fd-826b-26ab8f1725be">

withdraw/unlock buttons are equipped with cycle status bar wraping around the button itself.

# In case you want to verify joyDao's integrity
All you need to verify is that the output cells - being created - has **your lock script** and the **Nervos DAO type script** on it (in deposit and withdrawal). And that's it. As long as that's ensured, your funds will still be yours and there'll always be a way to spend it.

#### deposit transaction

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

You'll notice that the second cell doesn't have a Type Script, that is because it's a change in a UTXO transaction and it doesn't belong to any "type" of smart contract.

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
    1. `npm install`
    2. `npm run build`
    3. `npm run start`
