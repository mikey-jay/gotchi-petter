const Web3 = require('web3');

const POLYGON_RPC_HOST = "https://polygon-rpc.com/"
const web3 = new Web3(POLYGON_RPC_HOST)

const DEFAULT_GAS_LIMIT = 80000
const DEFAULT_MAX_PRIORITY_FEE_PER_GAS = web3.utils.toWei('30', 'gwei')

require('dotenv').config();

const PETTER_WALLET_ADDRESS = process.env.PETTER_WALLET_ADDRESS
const PETTER_WALLET_KEY = process.env.PETTER_WALLET_KEY
const GOTCHI_IDS = process.env.GOTCHI_IDS.split(",")

const PET_ABI = [{"inputs":[{"internalType":"uint256[]","name":"_tokenIds","type":"uint256[]"}],"name":"interact","outputs":[],"stateMutability":"nonpayable","type":"function"}];
const AAVEGOTCHI_DIAMOND_INSTANCE_CONTRACT = "0x86935F11C86623deC8a25696E1C19a8659CbF95d";

const pettingContract = new web3.eth.Contract(PET_ABI, AAVEGOTCHI_DIAMOND_INSTANCE_CONTRACT)

const createPetTransaction = async () => ({
  nonce: await web3.eth.getTransactionCount(PETTER_WALLET_ADDRESS),
  gasLimit: DEFAULT_GAS_LIMIT,
  maxPriorityFeePerGas: DEFAULT_MAX_PRIORITY_FEE_PER_GAS,
  from: PETTER_WALLET_ADDRESS,
  to: AAVEGOTCHI_DIAMOND_INSTANCE_CONTRACT,
  data: pettingContract.methods.interact(GOTCHI_IDS).encodeABI()
})

const signPetTransaction = (unsignedTransaction) => web3.eth.accounts.signTransaction(unsignedTransaction, PETTER_WALLET_KEY)
const sendPetTransaction = (signedTransaction) => web3.eth.sendSignedTransaction(signedTransaction.rawTransaction)

const notifySending = (payload) => console.log('Sending transaction...')
const notifySent = (payload) => console.log('Transaction sent...')
const notifyHash = (hash) => console.log('Transaction hash is ' + hash + ' ...')
const notifyReceipt = (receipt) => console.log('Obtained receipt...')
const notifyComplete = (receipt) => console.log('Transaction complete.')
const notifyError = (error) => Promise.reject(error)

createPetTransaction().then(signPetTransaction).then(
  (tx) => {
    sendPetTransaction(tx)
    .once('sending', notifySending)
    .once('sent', notifySent)
    .once('transactionHash', notifyHash)
    .once('receipt', notifyReceipt)
    .on('error', notifyError)
    .then(notifyComplete)
    .catch((error) => console.log('Error: ' + error))
  }
)