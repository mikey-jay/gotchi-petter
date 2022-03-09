# About This Project
I created this Node.js script to automatically pet my [Aavegotchis](https://aavegotchi.com)  every 12 hours. It works by querying the blockchain every 15 minutes and petting any gotchis that are ready.

The script estimates gas costs based on the current market and plays nicely with EIP-1559. There is an option in the code to set a hard limit on the amount of gas to use (defaults to 0.05 MATIC).
# Getting Started
## Setup a Dedicated Petting Wallet
You'll need to set up a dedicated ETH wallet with only a few bucks worth of MATIC token funded on the Polygon blockchain to cover gas fees for petting. You can use MetaMask or your favorite ERC20 wallet software to create the wallet.

**DO NOT use an existing wallet that holds any assets aside from a small amount of MATIC.** The private keys you provide for the script are stored in plaintext - this was not designed to be a secure solution for storing your life savings. Capiche? Okay- then let's get petting...

## Give the Petting Wallet Permission to Pet Your Gotchis
Aavegotchi has a `setPetOperatorForAll` function that allows gotchi owners to give petting permissions to another wallet. You'll need to call this function using the wallet that owns your gotchis, specifying the address of the petting wallet. This only needs to be done once, but this script does not handle that for you.

I used [louper.dev](https://louper.dev/diamond/0x86935F11C86623deC8a25696E1C19a8659CbF95d?network=polygon) to call this function - you'll find it in the **AavegotchiFacet** section. Use the **write** button at the bottom of the section and connect your wallet to call the `setPetOperatorForAll` function.

More details on this function can be found on [Aavegotchi's github](https://github.com/aavegotchi/aavegotchi-contracts/blob/2861d2cb9965df6fd5b4e7b39aa53c64fedf45b1/contracts/Aavegotchi/facets/AavegotchiFacet.sol).
## Install and Run the Petting Script
I am assuming you already have [Node.js](https://nodejs.org/en/) installed. The script was developed and tested with v17.4.0.
1. In the root directory of the project:
```
npm install
```

2. Create a .env file that looks like this:
```
PETTER_WALLET_ADDRESS=(petting wallet address ie: 0x...)
PETTER_WALLET_KEY=(petting wallet private key ie: 0x...)
GOTCHI_IDS=(ids of gotchis to pet ie: id1,id2,id3)
```
Include the public address and private key of your dedicated petting wallet. `GOTCHI_IDS` should be a comma separated list of ids. The id corresponds to the gotchis tokenId, which can also be found at the end of the url when viewing your gotchi. (ie: app.aavegotchi.com/gotchi/##### <-- the ID)

3. Run the script:
```
npm start
```
The script will run continuously until stopped, checking the status of the gotchis on the blockchain every 15 minutes. Pet transactions are only submitted if at least 12 hours has elapsed since the last time a gotchi was pet as reported by the smart contract.

# Production Use
If you're going to run this script in a full-time production setting, there are a few more things you may want to consider.

## Using PM2
To run the application in the background, you can use [PM2](https://pm2.keymetrics.io/) to daemonize it. An `ecosystem.config.js` file has been provided with some suggested settings. You can install PM2 globally using `npm install pm2 -g`.

To start the script, use `pm2 start`. To stop the script, you can use `pm2 stop gotchi-petter` or use `pm2 delete gotchi-petter`. You can monitor the script with `pm2 logs` or, the prettier version: `pm2 monit`

## Using Docker
A dockerfile is included if you want to run the script inside a Docker container. Here are some suggested commands:

Build the image (from project root):
```
docker build -t gotchi-petter .
```
Run the container
```
docker run -d --restart unless-stopped gotchi-petter
```